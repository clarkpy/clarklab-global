use crate::agent_log::AgentLogBuffer;
use crate::api::{AgentUpdateCompleteRequest, AgentUpdateTask};
use crate::config::{save_config, AgentConfig, AGENT_VERSION};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentReleaseManifest {
    tag: String,
    version: String,
    commit_sha: String,
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
            Duration::from_secs(10 * 60),
            tokio::task::spawn_blocking({
                let task = task.clone();
                move || run_agent_update(&task, progress)
            }),
        )
        .await;

        let mut result = match build_result {
            Ok(Ok(inner)) => inner,
            Ok(Err(err)) => Err(format!("agent update worker failed: {err}")),
            Err(_) => Err("agent update timed out after 10 minutes".to_string()),
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
                    message: body.message.clone().unwrap_or_else(|| err.clone()),
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

fn release_asset_name() -> Result<&'static str, String> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("clarklab-agent-linux-amd64"),
        "aarch64" => Ok("clarklab-agent-linux-arm64"),
        architecture => Err(format!("Unsupported architecture: {architecture}")),
    }
}

fn download_file(url: &str, destination: &Path) -> Result<(), String> {
    let output = Command::new("curl")
        .args([
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--retry",
            "3",
            "--output",
        ])
        .arg(destination)
        .arg(url)
        .output()
        .map_err(|err| format!("failed to start curl: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "download failed for {url}: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}

fn expected_checksum(checksums: &str, asset: &str) -> Option<String> {
    checksums.lines().find_map(|line| {
        let mut fields = line.split_whitespace();
        let checksum = fields.next()?;
        let filename = fields.next()?;

        if filename == asset && checksum.len() == 64 {
            Some(checksum.to_ascii_lowercase())
        } else {
            None
        }
    })
}

fn actual_checksum(path: &Path) -> Result<String, String> {
    let output = Command::new("sha256sum")
        .arg(path)
        .output()
        .map_err(|err| format!("failed to start sha256sum: {err}"))?;

    if !output.status.success() {
        return Err(format!(
            "sha256sum failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .next()
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "sha256sum returned no checksum".to_string())
}

fn install_downloaded_binary(update_root: &Path) -> Result<(), String> {
    let output = Command::new("sudo")
        .arg("/usr/local/sbin/clarklab-install-agent-binary")
        .arg(update_root)
        .output()
        .map_err(|err| format!("failed to run agent installer: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "agent installer failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}

fn run_agent_update(
    task: &AgentUpdateTask,
    mut on_progress: impl FnMut(String),
) -> Result<String, String> {
    if task.release_base_url.trim().is_empty() {
        return Err(
            "This update does not include a release download URL. Update the API before updating this agent."
                .to_string(),
        );
    }

    if task.release_version.trim().is_empty() || task.release_tag.trim().is_empty() {
        return Err("Agent release version information is missing".to_string());
    }

    let asset = release_asset_name()?;
    let update_root = std::env::temp_dir().join(format!("clarklab-upgrade-{}", task.id));

    if update_root.exists() {
        fs::remove_dir_all(&update_root)
            .map_err(|err| format!("failed to clear update directory: {err}"))?;
    }

    let binary_directory = update_root.join("target").join("release");
    fs::create_dir_all(&binary_directory)
        .map_err(|err| format!("failed to create update directory: {err}"))?;

    let binary_path = binary_directory.join("clarklab-agent");
    let checksums_path = update_root.join("checksums.txt");
    let manifest_path = update_root.join("agent-release.json");
    let base_url = task.release_base_url.trim_end_matches('/');

    on_progress(format!(
        "Downloading Clarklab Agent {} for {}",
        task.release_version,
        std::env::consts::ARCH
    ));

    download_file(&format!("{base_url}/{asset}"), &binary_path)?;

    download_file(&format!("{base_url}/checksums.txt"), &checksums_path)?;

    download_file(&format!("{base_url}/agent-release.json"), &manifest_path)?;

    let manifest_raw = fs::read_to_string(&manifest_path)
        .map_err(|err| format!("failed to read release manifest: {err}"))?;

    let manifest: AgentReleaseManifest = serde_json::from_str(&manifest_raw)
        .map_err(|err| format!("invalid release manifest: {err}"))?;

    if manifest.tag != task.release_tag {
        return Err(format!(
            "Release tag mismatch: expected {}, received {}",
            task.release_tag, manifest.tag
        ));
    }

    if manifest.version != task.release_version {
        return Err(format!(
            "Release version mismatch: expected {}, received {}",
            task.release_version, manifest.version
        ));
    }

    if !task.commit_sha.trim().is_empty() && manifest.commit_sha != task.commit_sha.trim() {
        return Err(format!(
            "Release {} was built from commit {}, but update task requires {}. Publish a new agent release from the current platform commit.",
            manifest.tag,
            manifest.commit_sha,
            task.commit_sha.trim()
        ));
    }

    let checksums = fs::read_to_string(&checksums_path)
        .map_err(|err| format!("failed to read checksums: {err}"))?;

    let expected = expected_checksum(&checksums, asset)
        .ok_or_else(|| format!("No checksum was published for {asset}"))?;

    let actual = actual_checksum(&binary_path)?;

    if actual != expected {
        return Err(format!(
            "Agent checksum mismatch: expected {expected}, received {actual}"
        ));
    }

    let validation = Command::new(&binary_path)
        .arg("--help")
        .output()
        .map_err(|err| format!("downloaded agent could not be executed: {err}"))?;

    if !validation.status.success() {
        return Err("Downloaded agent failed its executable validation".to_string());
    }

    on_progress("Installing verified agent binary".to_string());
    install_downloaded_binary(&update_root)?;

    let _ = fs::remove_dir_all(&update_root);

    Ok(format!(
        "Agent updated to {} ({})",
        manifest.version,
        &manifest.commit_sha[..7.min(manifest.commit_sha.len())]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_checksum_for_release_asset() {
        let checksums = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  clarklab-agent-linux-amd64
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  clarklab-agent-linux-arm64
";

        assert_eq!(
            expected_checksum(checksums, "clarklab-agent-linux-amd64"),
            Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string())
        );
    }

    #[test]
    fn rejects_missing_checksum() {
        assert_eq!(
            expected_checksum("aaaaaaaa  some-other-file", "clarklab-agent-linux-amd64"),
            None
        );
    }

    #[test]
    fn chooses_supported_release_asset() {
        let result = release_asset_name();

        if matches!(std::env::consts::ARCH, "x86_64" | "aarch64") {
            assert!(result.is_ok());
        } else {
            assert!(result.is_err());
        }
    }
}
