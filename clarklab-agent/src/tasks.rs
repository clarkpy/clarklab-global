use crate::agent_log::AgentLogBuffer;
use crate::api::DeployTask;
use crate::api::{HeartbeatRequest, HeartbeatResponse, RegisterResponse, TaskCompleteRequest};
use crate::build;
use crate::config::{clamp_heartbeat, normalize_data_root, resolved_data_root, AgentConfig};
use crate::data_root::{migrate_data_root, paths_equal};
use crate::docker::{self, RunSpec};
use crate::git;
use crate::journal::JournalCollector;
use crate::service_log::{ContainerLogCursors, TaskLogger};
use reqwest::Client;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

const SUPPORTED_TEMPLATES: &[&str] = &["postgresql", "mysql", "mongodb", "redis"];

fn emit_agent_line(agent_logs: &mut AgentLogBuffer, level: &str, message: impl AsRef<str>) {
    let message = message.as_ref();
    match level {
        "error" | "warn" => eprintln!("{message}"),
        _ => println!("{message}"),
    }

    // systemd captures stdout/stderr and the journal collector uploads it with
    // a durable cursor. Keep the in-memory path when running without journald.
    if std::env::var_os("JOURNAL_STREAM").is_none() {
        match level {
            "error" => agent_logs.error(message.to_string()),
            "warn" => agent_logs.warn(message.to_string()),
            _ => agent_logs.info(message.to_string()),
        }
    }
}

pub async fn register(
    token: String,
    server: String,
    config_path: std::path::PathBuf,
    cli_data_root: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let body = crate::api::build_register_request(token);

    let url = format!("{}/api/agent/register", server.trim_end_matches('/'));
    let response = client.post(&url).json(&body).send().await?;
    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Registration failed: {}", text).into());
    }

    let result: RegisterResponse = response.json().await?;
    let data_root = cli_data_root
        .or(result.data_root)
        .map(|value| normalize_data_root(&value))
        .unwrap_or_else(|| normalize_data_root(crate::config::DEFAULT_DATA_ROOT));

    let config = AgentConfig {
        server_url: server.trim_end_matches('/').to_string(),
        node_id: result.node_id,
        agent_token: result.agent_token,
        data_root,
        deployed_commit_sha: String::new(),
    };

    crate::config::save_config(&config_path, &config)?;
    let interval = result
        .heartbeat_interval_seconds
        .map(clamp_heartbeat)
        .unwrap_or(crate::config::DEFAULT_HEARTBEAT_SECONDS);
    println!("Registered node {}", config.node_id);
    println!("Data root: {}", config.data_root);
    println!("Heartbeat interval: {}s", interval);
    println!("Run: clarklab-agent run --config {}", config_path.display());
    Ok(())
}

pub async fn send_heartbeat(
    client: &Client,
    config: &AgentConfig,
    metrics: HeartbeatRequest,
) -> Result<HeartbeatResponse, String> {
    let url = format!("{}/api/agent/heartbeat", config.server_url);
    let response = client
        .post(&url)
        .bearer_auth(&config.agent_token)
        .json(&metrics)
        .send()
        .await
        .map_err(|e| format!("heartbeat request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("heartbeat failed: {}", response.status()));
    }

    response
        .json::<HeartbeatResponse>()
        .await
        .map_err(|e| format!("invalid heartbeat response: {e}"))
}

pub async fn complete_task(
    client: &Client,
    config: &AgentConfig,
    task_id: &str,
    body: TaskCompleteRequest,
) -> Result<(), String> {
    let url = format!("{}/api/agent/tasks/{}/complete", config.server_url, task_id);
    let response = client
        .post(&url)
        .bearer_auth(&config.agent_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("task complete request failed: {e}"))?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("task complete failed: {text}"));
    }
    Ok(())
}

fn deployment_id_from_task(task: &DeployTask) -> Option<String> {
    task.payload
        .get("deploymentId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn validate_database_task(task: &DeployTask) -> Result<(), String> {
    if task.effective_source_type() != "database" {
        return Err("only database services are supported".to_string());
    }
    if !SUPPORTED_TEMPLATES.contains(&task.template_id.as_str()) {
        return Err(format!(
            "unsupported template '{}'. supported: {}",
            task.template_id,
            SUPPORTED_TEMPLATES.join(", ")
        ));
    }
    if task.image.trim().is_empty() {
        return Err("missing docker image".to_string());
    }
    let port = task.port.ok_or_else(|| "missing port".to_string())?;
    if port == 0 {
        return Err("invalid port".to_string());
    }
    Ok(())
}

fn validate_git_task(task: &DeployTask, require_auth: bool) -> Result<(), String> {
    if task.effective_source_type() != "git" {
        return Err("service is not a git deployment".to_string());
    }
    if task.repository_or_config().trim().is_empty() && task.repository_url.trim().is_empty() {
        return Err("missing repository".to_string());
    }
    if require_auth && task.git_http_header.trim().is_empty() {
        return Err("missing clone credentials".to_string());
    }
    if require_auth && task.repository_url.trim().is_empty() {
        return Err("missing repository URL".to_string());
    }
    let port = task.port.ok_or_else(|| "missing port".to_string())?;
    if port == 0 {
        return Err("invalid port".to_string());
    }
    Ok(())
}

fn validate_task(task: &DeployTask) -> Result<(), String> {
    if task.effective_source_type() == "git" {
        return validate_git_task(task, true);
    }
    validate_database_task(task)
}

fn git_image_name(service_environment_id: &str) -> String {
    format!("clarklab-{service_environment_id}:latest")
}

fn service_env_dir(data_root: &str, service_environment_id: &str) -> String {
    format!(
        "{}/{}",
        resolved_data_root(data_root).trim_end_matches('/'),
        service_environment_id
    )
}

fn source_dir(data_root: &str, service_environment_id: &str) -> String {
    format!(
        "{}/source",
        service_env_dir(data_root, service_environment_id)
    )
}

fn run_spec_from_task(task: &DeployTask, data_root: &str) -> RunSpec {
    let host_data_path = if task.storage.enabled {
        format!(
            "{}/data",
            service_env_dir(data_root, &task.service_environment_id)
        )
    } else {
        String::new()
    };

    let image = if task.effective_source_type() == "git" {
        git_image_name(&task.service_environment_id)
    } else {
        task.image.clone()
    };

    RunSpec {
        container_name: task.container_name.clone(),
        image,
        port: task.port.unwrap_or(0),
        container_port: task
            .container_port
            .filter(|value| *value > 0)
            .or(task.port)
            .unwrap_or(0),
        env_vars: task
            .env_vars
            .iter()
            .map(|v| (v.key.clone(), v.value.clone()))
            .collect(),
        storage_enabled: task.storage.enabled,
        mount_path: task.storage.mount_path.clone(),
        host_data_path,
        service_id: task.service_id.clone(),
        skip_pull: task.effective_source_type() == "git",
        restart_policy: task.docker_restart_policy(),
        health_check: task.health_check_or_config(),
        inject_app_runtime_env: task.effective_source_type() == "git",
        entrypoint: None,
        command: Vec::new(),
    }
}

fn process_git_deploy(task: &DeployTask, data_root: &str, logger: &mut TaskLogger) -> TaskOutcome {
    if let Err(err) = validate_git_task(task, true) {
        logger.error(&err);
        return TaskOutcome::failure(err, logger);
    }

    let source = source_dir(data_root, &task.service_environment_id);
    let source_path = Path::new(&source);
    let commit_sha = if task.commit_sha.trim().is_empty() {
        None
    } else {
        Some(task.commit_sha.as_str())
    };

    let repository_url = if !task.repository_url.trim().is_empty() {
        task.repository_url.clone()
    } else {
        format!("{}.git", task.repository_or_config().trim_end_matches('/'))
    };

    if let Err(err) = git::clone_repo(
        &repository_url,
        Some(&task.git_http_header),
        source_path,
        &task.branch_or_config(),
        commit_sha,
        logger,
    ) {
        return TaskOutcome::failure(err, logger);
    }

    let context = git::build_context_path(source_path, &task.root_directory_or_config());
    let context_str = context
        .to_str()
        .unwrap_or_else(|| source_path.to_str().unwrap_or(&source));

    if !context.is_dir() {
        let err = format!("build context directory not found: {}", context.display());
        logger.error(&err);
        return TaskOutcome::failure(err, logger);
    }

    logger.info(format!("Using build context {}", context.display()));

    let image = git_image_name(&task.service_environment_id);
    if let Err(err) = build::nixpacks_build(context_str, &image, &task.nixpacks_options(), logger) {
        return TaskOutcome::failure(err, logger);
    }

    let spec = run_spec_from_task(task, data_root);
    match docker::docker_run(&spec, Some(logger)) {
        Ok(container_id) => TaskOutcome::success(
            container_id,
            format!("Deployed {} from git repository", task.service_name),
            logger,
        ),
        Err(err) => TaskOutcome::failure(err, logger),
    }
}

pub async fn process_task(
    client: &Client,
    config: &AgentConfig,
    task: &DeployTask,
    agent_logs: &mut AgentLogBuffer,
) -> Result<(), String> {
    emit_agent_line(
        agent_logs,
        "info",
        format!(
            "Processing task {} action={} service={}",
            task.id, task.action, task.service_name
        ),
    );

    let deployment_id = deployment_id_from_task(task);
    let mut logger = TaskLogger::new();
    logger.info(format!(
        "Starting {} for {} ({})",
        task.action, task.service_name, task.id
    ));

    let result = match task.action.as_str() {
        "deploy" => {
            if task.effective_source_type() == "git" {
                process_git_deploy(task, &config.data_root, &mut logger)
            } else {
                if let Err(err) = validate_task(task) {
                    logger.error(&err);
                    return report_failure(
                        client,
                        config,
                        task,
                        deployment_id,
                        err,
                        logger,
                        agent_logs,
                    )
                    .await;
                }
                let spec = run_spec_from_task(task, &config.data_root);
                match docker::docker_run(&spec, Some(&mut logger)) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Deployed {}", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            }
        }
        "start" => {
            if docker::container_exists(&task.container_name) {
                logger.info(format!(
                    "Starting existing container {}",
                    task.container_name
                ));
                match docker::docker_start(&task.container_name) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Started {}", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            } else if task.effective_source_type() == "git" {
                if let Err(err) = validate_git_task(task, false) {
                    logger.error(&err);
                    return report_failure(
                        client,
                        config,
                        task,
                        deployment_id,
                        err,
                        logger,
                        agent_logs,
                    )
                    .await;
                }
                let image = git_image_name(&task.service_environment_id);
                if !docker::local_image_exists(&image) {
                    let err = "no built image found; redeploy the service first".to_string();
                    logger.error(&err);
                    return report_failure(
                        client,
                        config,
                        task,
                        deployment_id,
                        err,
                        logger,
                        agent_logs,
                    )
                    .await;
                }
                let spec = run_spec_from_task(task, &config.data_root);
                match docker::docker_run(&spec, Some(&mut logger)) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Started {} (new container)", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            } else {
                if let Err(err) = validate_task(task) {
                    logger.error(&err);
                    return report_failure(
                        client,
                        config,
                        task,
                        deployment_id,
                        err,
                        logger,
                        agent_logs,
                    )
                    .await;
                }
                let spec = run_spec_from_task(task, &config.data_root);
                match docker::docker_run(&spec, Some(&mut logger)) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Started {} (new container)", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            }
        }
        "stop" => {
            logger.info(format!("Stopping container {}", task.container_name));
            match docker::docker_stop(&task.container_name) {
                Ok(()) => TaskOutcome::success(
                    String::new(),
                    format!("Stopped {}", task.service_name),
                    &mut logger,
                ),
                Err(err) => TaskOutcome::failure(err, &mut logger),
            }
        }
        "restart" => {
            if docker::container_exists(&task.container_name) {
                logger.info(format!("Restarting container {}", task.container_name));
                match docker::docker_restart(&task.container_name) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Restarted {}", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            } else if task.effective_source_type() == "git" {
                if let Err(err) = validate_git_task(task, false) {
                    logger.error(&err);
                    return report_failure(
                        client,
                        config,
                        task,
                        deployment_id,
                        err,
                        logger,
                        agent_logs,
                    )
                    .await;
                }
                let image = git_image_name(&task.service_environment_id);
                if !docker::local_image_exists(&image) {
                    let err = "no built image found; redeploy the service first".to_string();
                    logger.error(&err);
                    return report_failure(
                        client,
                        config,
                        task,
                        deployment_id,
                        err,
                        logger,
                        agent_logs,
                    )
                    .await;
                }
                let spec = run_spec_from_task(task, &config.data_root);
                match docker::docker_run(&spec, Some(&mut logger)) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Restarted {} (recreated)", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            } else if let Err(err) = validate_task(task) {
                logger.error(&err);
                return report_failure(
                    client,
                    config,
                    task,
                    deployment_id,
                    err,
                    logger,
                    agent_logs,
                )
                .await;
            } else {
                let spec = run_spec_from_task(task, &config.data_root);
                match docker::docker_run(&spec, Some(&mut logger)) {
                    Ok(container_id) => TaskOutcome::success(
                        container_id,
                        format!("Restarted {} (recreated)", task.service_name),
                        &mut logger,
                    ),
                    Err(err) => TaskOutcome::failure(err, &mut logger),
                }
            }
        }
        other => {
            let err = format!("unknown action: {other}");
            logger.error(&err);
            TaskOutcome::failure(err, &mut logger)
        }
    };

    let body = TaskCompleteRequest {
        status: if result.ok {
            "completed".to_string()
        } else {
            "failed".to_string()
        },
        container_id: if result.container_id.is_empty() {
            None
        } else {
            Some(result.container_id)
        },
        message: Some(result.message.clone()),
        deployment_id,
        logs: result.logs.clone(),
    };

    agent_logs.ingest_task_logs(&result.logs);

    complete_task(client, config, &task.id, body).await?;
    if result.ok {
        emit_agent_line(agent_logs, "info", format!("Task {} completed", task.id));
    } else {
        emit_agent_line(agent_logs, "error", format!("Task {} failed", task.id));
    }
    Ok(())
}

struct TaskOutcome {
    ok: bool,
    container_id: String,
    message: String,
    logs: Vec<crate::service_log::TaskLogEntry>,
}

impl TaskOutcome {
    fn success(container_id: String, message: String, logger: &mut TaskLogger) -> Self {
        logger.info(&message);
        Self {
            ok: true,
            container_id,
            message,
            logs: logger.drain(),
        }
    }

    fn failure(message: String, logger: &mut TaskLogger) -> Self {
        logger.error(&message);
        Self {
            ok: false,
            container_id: String::new(),
            message,
            logs: logger.drain(),
        }
    }
}

async fn report_failure(
    client: &Client,
    config: &AgentConfig,
    task: &DeployTask,
    deployment_id: Option<String>,
    message: String,
    mut logger: TaskLogger,
    agent_logs: &mut AgentLogBuffer,
) -> Result<(), String> {
    emit_agent_line(
        agent_logs,
        "error",
        format!("Task {} failed: {}", task.id, message),
    );
    logger.error(&message);
    let logs = logger.drain();
    agent_logs.ingest_task_logs(&logs);
    complete_task(
        client,
        config,
        &task.id,
        TaskCompleteRequest {
            status: "failed".to_string(),
            container_id: None,
            message: Some(message),
            deployment_id,
            logs,
        },
    )
    .await
}

async fn sync_data_root(
    config: &mut AgentConfig,
    config_path: &std::path::PathBuf,
    response: &HeartbeatResponse,
    agent_logs: &mut AgentLogBuffer,
) {
    let Some(desired) = response.data_root.as_ref() else {
        return;
    };

    let desired = normalize_data_root(desired);
    if paths_equal(&config.data_root, &desired) {
        return;
    }

    let old_root = config.data_root.clone();
    if response.migrate_data {
        match migrate_data_root(&old_root, &desired) {
            Ok(()) => emit_agent_line(
                agent_logs,
                "info",
                format!("Migrated service data from {old_root} to {desired}"),
            ),
            Err(err) => {
                agent_logs.error(format!("Data root migration failed: {err}"));
                return;
            }
        }
    } else {
        emit_agent_line(
            agent_logs,
            "info",
            format!("Switching data root from {old_root} to {desired} without migration"),
        );
    }

    config.data_root = desired;
    if let Err(err) = crate::config::save_config(config_path, config) {
        agent_logs.error(format!("Failed to save updated data root: {err}"));
    }
}

pub async fn run_agent(config_path: std::path::PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let mut config = crate::config::load_config(&config_path)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?;
    let mut last_network = None;
    let mut heartbeat_seconds = crate::config::DEFAULT_HEARTBEAT_SECONDS;
    let mut log_cursors = ContainerLogCursors::default();
    let mut agent_logs = AgentLogBuffer::new();
    let shared_logs = Arc::new(Mutex::new(AgentLogBuffer::new()));
    let journal_cursor_path = config_path.with_file_name("journal.cursor");
    let mut journal = JournalCollector::new("clarklab-agent.service", journal_cursor_path);

    if detect_docker_unavailable() {
        agent_logs.warn("Docker is not available on this node. Deploy tasks will fail.");
    }
    if !git::git_available() {
        agent_logs.warn("git is not available on this node. Git deploy tasks will fail.");
    }

    emit_agent_line(
        &mut agent_logs,
        "info",
        format!(
            "Agent started for node {} (data root: {})",
            config.node_id, config.data_root
        ),
    );

    loop {
        let reported = resolved_data_root(&config.data_root);
        let mut metrics = crate::api::collect_metrics(
            &mut last_network,
            &reported,
            &crate::config::reported_agent_version(&config),
        );
        metrics.containers = crate::docker::collect_managed_container_stats();
        metrics.service_logs = crate::docker::collect_service_logs(&mut log_cursors);
        {
            let mut background = shared_logs.lock().await;
            for line in background.drain() {
                match line.level.as_str() {
                    "error" => agent_logs.error(line.message),
                    "warn" => agent_logs.warn(line.message),
                    _ => agent_logs.info(line.message),
                }
            }
        }

        let journal_batch = match journal.collect() {
            Ok(batch) => batch,
            Err(err) => {
                agent_logs.error(format!("Journal collection error: {err}"));
                Default::default()
            }
        };

        let journal_cursor = journal_batch.next_cursor.clone();

        metrics.agent_logs = agent_logs.drain();
        metrics.agent_logs.extend(journal_batch.entries);

        match send_heartbeat(&client, &config, metrics).await {
            Ok(body) => {
                if let Some(cursor) = journal_cursor.as_deref() {
                    if let Err(err) = journal.commit(cursor) {
                        agent_logs.warn(format!("Could not save journal cursor: {err}"));
                    }
                }
                heartbeat_seconds = clamp_heartbeat(body.heartbeat_interval_seconds);
                let pending_count = body.pending_tasks.len();
                emit_agent_line(
                    &mut agent_logs,
                    "info",
                    format!("Heartbeat ok — {pending_count} pending task(s)"),
                );
                sync_data_root(&mut config, &config_path, &body, &mut agent_logs).await;
                crate::upgrade::retry_pending_completion(
                    &client,
                    &mut config,
                    &config_path,
                    &mut agent_logs,
                )
                .await;
                if let Some(update_task) = body.pending_agent_update {
                    crate::upgrade::maybe_start_agent_update(
                        client.clone(),
                        config.clone(),
                        config_path.clone(),
                        update_task,
                        shared_logs.clone(),
                    )
                    .await;
                }
                for task in body.pending_tasks {
                    if let Err(err) = process_task(&client, &config, &task, &mut agent_logs).await {
                        agent_logs.error(format!("Task processing error: {err}"));
                    }
                }
            }
            Err(err) => {
                agent_logs.error(format!("Heartbeat error: {err}"));
            }
        }

        tokio::time::sleep(Duration::from_secs(heartbeat_seconds)).await;
    }
}

fn detect_docker_unavailable() -> bool {
    crate::api::detect_docker_version() == "unavailable"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::{DeployTask, TaskEnvVar, TaskStorage};
    use serde_json::json;

    fn sample_task(action: &str, template_id: &str, source_type: &str) -> DeployTask {
        DeployTask {
            id: "task-1".to_string(),
            action: action.to_string(),
            service_id: "svc-1".to_string(),
            service_name: "mysql".to_string(),
            service_environment_id: "env-1".to_string(),
            environment: "production".to_string(),
            port: Some(3306),
            image: "mysql:8".to_string(),
            container_name: "clarklab-env-1".to_string(),
            existing_container_id: String::new(),
            template_id: template_id.to_string(),
            source_type: source_type.to_string(),
            env_vars: vec![TaskEnvVar {
                key: "MYSQL_ROOT_PASSWORD".to_string(),
                value: "secret".to_string(),
                is_secret: true,
            }],
            storage: TaskStorage {
                enabled: true,
                mount_path: "/var/lib/mysql".to_string(),
                host_data_path: "/var/lib/clarklab/services/env-1/data".to_string(),
            },
            payload: json!({ "deploymentId": "dep-1" }),
            repository: String::new(),
            branch: String::new(),
            root_directory: String::new(),
            repository_url: String::new(),
            git_http_header: String::new(),
            commit_sha: String::new(),
            deploy_config: json!({}),
            start_command: String::new(),
            build_command: String::new(),
            install_command: String::new(),
            restart_policy: "unless-stopped".to_string(),
            health_check: String::new(),
            container_port: Some(3306),
        }
    }

    fn sample_git_task() -> DeployTask {
        DeployTask {
            repository: "https://github.com/example/app".to_string(),
            branch: "main".to_string(),
            root_directory: "/".to_string(),
            repository_url: "https://github.com/example/app.git".to_string(),
            git_http_header: "Authorization: Basic dGVzdA==".to_string(),
            commit_sha: "abc123".to_string(),
            ..sample_task("deploy", "", "git")
        }
    }

    #[test]
    fn validate_accepts_supported_database_template() {
        let task = sample_task("deploy", "mysql", "database");
        assert!(validate_database_task(&task).is_ok());
    }

    #[test]
    fn validate_git_requires_repository_and_auth_header() {
        let task = sample_git_task();
        assert!(validate_git_task(&task, true).is_ok());

        let mut missing_repo = sample_git_task();
        missing_repo.repository = String::new();
        missing_repo.repository_url = String::new();
        assert!(validate_git_task(&missing_repo, true).is_err());
    }

    #[test]
    fn effective_source_type_detects_git_from_repository() {
        let mut task = sample_git_task();
        task.source_type = String::new();
        assert_eq!(task.effective_source_type(), "git");
    }

    #[test]
    fn effective_source_type_detects_git_from_deploy_config() {
        let mut task = sample_task("deploy", "", "database");
        task.deploy_config = json!({
            "sourceType": "git",
            "repository": "https://github.com/example/app"
        });
        assert_eq!(task.effective_source_type(), "git");
    }

    #[test]
    fn source_dir_is_under_data_root_without_extra_services_segment() {
        let dir = source_dir("/var/lib/clarklab/services", "env-1");
        assert_eq!(dir, "/var/lib/clarklab/services/env-1/source");
    }
}
