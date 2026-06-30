use crate::agent_log::AgentLogBuffer;
use crate::api::{AgentUpdateCompleteRequest, AgentUpdateTask};
use crate::config::{save_config, AgentConfig, AGENT_VERSION};
use crate::git;
use crate::service_log::TaskLogger;
use crate::toolchain::cargo_command;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

static UPDATE_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Deserialize)]
struct PendingCompletion {
    task_id: String,
    status: String,
    message: String,
    agent_version: String,
    deployed_commit_sha: Option<String>,
}

fn pending_completion_path(config_path: &Path) -> PathBuf {
    config_path
        .parent()
        .map(|dir| dir.join("pending-agent-update.json"))
        .unwrap_or_else(|| PathBuf::from("pending-agent-update.json"))
}

fn save_pending_completion(config_path: &Path, pending: &PendingCompletion) -> Result<(), String> {
    let path = pending_completion_path(config_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create pending update directory: {err}"))?;
    }
    let raw = serde_json::to_string(pending)
        .map_err(|err| format!("failed to encode pending update: {err}"))?;
    fs::write(&path, raw).map_err(|err| format!("failed to save pending update: {err}"))
}

fn load_pending_completion(config_path: &Path) -> Option<PendingCompletion> {
    let path = pending_completion_path(config_path);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn clear_pending_completion(config_path: &Path) {
    let _ = fs::remove_file(pending_completion_path(config_path));
}

pub async fn retry_pending_completion(
    client: &Client,
    config: &mut AgentConfig,
    config_path: &Path,
    agent_logs: &mut AgentLogBuffer,
) {
    let Some(pending) = load_pending_completion(config_path) else {
        return;
    };

    agent_logs.info(format!(
        "Retrying agent update completion for {}",
        pending.task_id
    ));

    let body = AgentUpdateCompleteRequest {
        status: pending.status.clone(),
        message: Some(pending.message.clone()),
        agent_version: Some(pending.agent_version.clone()),
    };

    match report_completion(client, config, &pending.task_id, &body).await {
        Ok(()) => {
            if let Some(sha) = pending.deployed_commit_sha.as_ref() {
                config.deployed_commit_sha = sha.clone();
                if let Err(err) = save_config(&config_path.to_path_buf(), config) {
                    agent_logs.error(format!("Could not persist deployed commit: {err}"));
                }
            }
            clear_pending_completion(config_path);
            agent_logs.info("Agent update completion acknowledged");
            if pending.status == "completed" {
                restart_agent_service(agent_logs);
            }
        }
        Err(err) => {
            agent_logs.warn(format!("Still waiting to report agent update: {err}"));
        }
    }
}

pub async fn maybe_start_agent_update(
    client: Client,
    config: AgentConfig,
    config_path: PathBuf,
    task: AgentUpdateTask,
    agent_logs: Arc<Mutex<AgentLogBuffer>>,
) {
    if UPDATE_RUNNING.swap(true, Ordering::SeqCst) {
        let mut logs = agent_logs.lock().await;
        logs.info("Agent update already in progress on this node");
        return;
    }

    {
        let mut logs = agent_logs.lock().await;
        logs.info(format!("Starting agent update {}", task.id));
    }

    tokio::spawn(async move {
        let progress_client = client.clone();
        let progress_config = config.clone();
        let progress_task_id = task.id.clone();
        let progress_logs = agent_logs.clone();

        let progress = move |message: String| {
            let progress_client = progress_client.clone();
            let progress_config = progress_config.clone();
            let progress_task_id = progress_task_id.clone();
            let progress_logs = progress_logs.clone();
            let message_for_api = message.clone();
            tokio::spawn(async move {
                let mut logs = progress_logs.lock().await;
                logs.info(message);
                let _ = report_progress(
                    &progress_client,
                    &progress_config,
                    &progress_task_id,
                    &message_for_api,
                )
                .await;
            });
        };

        // Keep below API STALE_CLAIM_MINUTES (90) so long builds are not marked failed server-side.
        let build_result = tokio::time::timeout(
            Duration::from_secs(45 * 60),
            tokio::task::spawn_blocking({
                let task = task.clone();
                move || run_agent_update(&task, progress)
            }),
        )
        .await;

        let mut result = match build_result {
            Ok(Ok(inner)) => inner,
            Ok(Err(err)) => Err(format!("agent update worker failed: {err}")),
            Err(_) => Err("agent update timed out after 45 minutes".to_string()),
        };

        let deployed_sha = task.commit_sha.trim().to_string();
        let agent_version = if deployed_sha.is_empty() {
            AGENT_VERSION.to_string()
        } else {
            deployed_sha.clone()
        };

        let mut updated_config = config.clone();
        if result.is_ok() && !deployed_sha.is_empty() {
            updated_config.deployed_commit_sha = deployed_sha.clone();
            if let Err(err) = save_config(&config_path, &updated_config) {
                result = Err(format!("Could not persist deployed commit: {err}"));
            }
        }

        let body = AgentUpdateCompleteRequest {
            status: if result.is_ok() {
                "completed".to_string()
            } else {
                "failed".to_string()
            },
            message: result
                .as_ref()
                .ok()
                .cloned()
                .or_else(|| result.as_ref().err().cloned()),
            agent_version: Some(agent_version.clone()),
        };

        match report_completion(&client, &config, &task.id, &body).await {
            Ok(()) => {
                let mut logs = agent_logs.lock().await;
                logs.info(
                    result
                        .as_ref()
                        .ok()
                        .cloned()
                        .unwrap_or_else(|| "Agent update finished".to_string()),
                );
                if result.is_ok() {
                    restart_agent_service(&mut logs);
                }
            }
            Err(err) => {
                let pending = PendingCompletion {
                    task_id: task.id.clone(),
                    status: body.status.clone(),
                    message: body
                        .message
                        .clone()
                        .unwrap_or_else(|| err.clone()),
                    agent_version: agent_version.clone(),
                    deployed_commit_sha: if result.is_ok() && !deployed_sha.is_empty() {
                        Some(deployed_sha)
                    } else {
                        None
                    },
                };
                if let Err(save_err) = save_pending_completion(&config_path, &pending) {
                    let mut logs = agent_logs.lock().await;
                    logs.error(format!(
                        "Build finished but could not save pending completion: {save_err}"
                    ));
                } else {
                    let mut logs = agent_logs.lock().await;
                    logs.warn(format!(
                        "Build finished but API is unreachable ({err}). Will retry completion on the next heartbeat."
                    ));
                }
            }
        }

        UPDATE_RUNNING.store(false, Ordering::SeqCst);
    });
}

async fn report_progress(
    client: &Client,
    config: &AgentConfig,
    task_id: &str,
    message: &str,
) -> Result<(), String> {
    let url = format!(
        "{}/api/agent/updates/{}/progress",
        config.server_url.trim_end_matches('/'),
        task_id
    );

    let response = client
        .post(url)
        .bearer_auth(&config.agent_token)
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .map_err(|err| format!("failed to report agent update progress: {err}"))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("progress report rejected: {}", response.status()))
    }
}

async fn report_completion(
    client: &Client,
    config: &AgentConfig,
    task_id: &str,
    body: &AgentUpdateCompleteRequest,
) -> Result<(), String> {
    let url = format!(
        "{}/api/agent/updates/{}/complete",
        config.server_url.trim_end_matches('/'),
        task_id
    );

    for attempt in 0..12 {
        let response = client
            .post(url.clone())
            .bearer_auth(&config.agent_token)
            .json(body)
            .send()
            .await;

        match response {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) if attempt == 11 => {
                let detail = response.text().await.unwrap_or_default();
                return Err(format!("agent update completion rejected: {detail}"));
            }
            Err(err) if attempt == 11 => {
                return Err(format!("failed to report agent update: {err}"));
            }
            Ok(_) | Err(_) => {
                tokio::time::sleep(Duration::from_secs(5 * (attempt as u64 + 1))).await;
            }
        }
    }

    Err("failed to report agent update completion".to_string())
}

fn resolve_systemctl_binary() -> String {
    for candidate in ["/usr/bin/systemctl", "/bin/systemctl"] {
        if Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "systemctl".to_string()
}

fn restart_agent_service(agent_logs: &mut AgentLogBuffer) {
    agent_logs.info("Restarting agent service");
    let systemctl = resolve_systemctl_binary();
    let result = Command::new("sudo")
        .arg(&systemctl)
        .args(["restart", "--no-block", "clarklab-agent"])
        .status();

    match result {
        Ok(status) if status.success() => agent_logs.info("Agent restart scheduled"),
        Ok(status) => {
            agent_logs.error(format!("Agent restart command exited with status {status}"))
        }
        Err(err) => agent_logs.error(format!("Failed to restart agent service: {err}")),
    }
}

fn run_agent_update(
    task: &AgentUpdateTask,
    mut on_progress: impl FnMut(String),
) -> Result<String, String> {
    let repo_dir = std::env::temp_dir()
        .join(format!("clarklab-upgrade-{}", task.id))
        .join("repo");
    if repo_dir.exists() {
        fs::remove_dir_all(&repo_dir)
            .map_err(|err| format!("failed to clear upgrade directory: {err}"))?;
    }
    if let Some(parent) = repo_dir.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create upgrade directory: {err}"))?;
    }

    let mut logger = TaskLogger::new();

    on_progress(format!(
        "Cloning {} (branch {})",
        task.repository_url, task.branch
    ));

    let header = task.git_http_header.trim();
    git::clone_repo(
        &task.repository_url,
        if header.is_empty() {
            None
        } else {
            Some(header)
        },
        &repo_dir,
        &task.branch,
        if task.commit_sha.trim().is_empty() {
            None
        } else {
            Some(task.commit_sha.trim())
        },
        &mut logger,
    )?;

    let root = normalize_root_directory(&task.root_directory);
    let build_dir = repo_dir.join(root);
    if !build_dir.join("Cargo.toml").exists() {
        return Err(format!(
            "agent source not found at {}/{}",
            task.repository, task.root_directory
        ));
    }

    on_progress("Building clarklab-agent from source".to_string());
    let build_output = cargo_command()?
        .arg("build")
        .arg("--release")
        .arg("--locked")
        .current_dir(&build_dir)
        .env("CARGO_NET_RETRY", "2")
        .output()
        .map_err(|err| format!("failed to run cargo build: {err}"))?;

    if !build_output.status.success() {
        let stderr = String::from_utf8_lossy(&build_output.stderr);
        return Err(format!("cargo build failed: {stderr}"));
    }

    on_progress("Installing updated agent binary".to_string());
    let install_output = Command::new("sudo")
        .arg("/usr/local/sbin/clarklab-install-agent-binary")
        .arg(&build_dir)
        .output()
        .map_err(|err| format!("failed to run install helper: {err}"))?;

    if !install_output.status.success() {
        let stderr = String::from_utf8_lossy(&install_output.stderr);
        return Err(format!(
            "agent install helper failed: {stderr}. Re-run install.sh on this node to configure sudo access."
        ));
    }

    if let Some(parent) = repo_dir.parent() {
        let _ = fs::remove_dir_all(parent);
    }

    Ok(format!(
        "Agent updated to {}",
        if task.commit_sha.trim().is_empty() {
            AGENT_VERSION.to_string()
        } else {
            task.commit_sha.trim()[..7.min(task.commit_sha.trim().len())].to_string()
        }
    ))
}

fn normalize_root_directory(root: &str) -> std::path::PathBuf {
    let trimmed = root.trim().trim_matches('/');
    if trimmed.is_empty() {
        std::path::PathBuf::from("clarklab-agent")
    } else {
        std::path::PathBuf::from(trimmed)
    }
}
