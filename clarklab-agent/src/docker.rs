use crate::service_log::{
    classify_container_log_line, ContainerLogCursors, ServiceLogLine, TaskLogger,
};
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct RunSpec {
    pub container_name: String,
    pub image: String,
    pub port: u32,
    pub container_port: u32,
    pub env_vars: Vec<(String, String)>,
    pub storage_enabled: bool,
    pub mount_path: String,
    pub host_data_path: String,
    pub service_id: String,
    pub skip_pull: bool,
    pub restart_policy: String,
    pub health_check: String,
    pub inject_app_runtime_env: bool,
    pub entrypoint: Option<String>,
    pub command: Vec<String>,
}

pub fn docker_pull(image: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["pull", image])
        .output()
        .map_err(|e| format!("failed to run docker pull: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "docker pull failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

pub fn container_exists(name: &str) -> bool {
    Command::new("docker")
        .args(["inspect", "-f", "{{.Id}}", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn remove_container(name: &str) -> Result<(), String> {
    if !container_exists(name) {
        return Ok(());
    }
    let _ = Command::new("docker").args(["rm", "-f", name]).output();
    Ok(())
}

pub fn local_image_exists(image: &str) -> bool {
    Command::new("docker")
        .args(["image", "inspect", image])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn inspect_container_id(name: &str) -> Option<String> {
    let output = Command::new("docker")
        .args(["inspect", "-f", "{{.Id}}", name])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

pub fn build_run_args(spec: &RunSpec) -> Vec<String> {
    let mut args = vec![
        "run".to_string(),
        "-d".to_string(),
        "--name".to_string(),
        spec.container_name.clone(),
        "--label".to_string(),
        "clarklab.managed=true".to_string(),
        "--label".to_string(),
        format!("clarklab.service_id={}", spec.service_id),
        "--restart".to_string(),
        spec.restart_policy.clone(),
    ];

    if spec.port > 0 {
        let container_port = if spec.container_port > 0 {
            spec.container_port
        } else {
            spec.port
        };
        args.push("-p".to_string());
        args.push(format!("0.0.0.0:{}:{}", spec.port, container_port));
    }

    for (key, value) in &spec.env_vars {
        args.push("-e".to_string());
        args.push(format!("{key}={value}"));
    }

    if spec.storage_enabled && !spec.mount_path.is_empty() && !spec.host_data_path.is_empty() {
        args.push("-v".to_string());
        args.push(format!("{}:{}", spec.host_data_path, spec.mount_path));
    }

    if let Some(entrypoint) = &spec.entrypoint {
        args.push("--entrypoint".to_string());
        args.push(entrypoint.clone());
    }

    if !spec.health_check.trim().is_empty() {
        args.push("--health-cmd".to_string());
        args.push(spec.health_check.trim().to_string());
        args.push("--health-interval".to_string());
        args.push("30s".to_string());
        args.push("--health-timeout".to_string());
        args.push("5s".to_string());
        args.push("--health-retries".to_string());
        args.push("3".to_string());
        args.push("--health-start-period".to_string());
        args.push("30s".to_string());
    }

    args.push(spec.image.clone());
    args.extend(spec.command.clone());
    args
}

pub fn runtime_env_vars(
    port: u32,
    env_vars: Vec<(String, String)>,
    inject_app_runtime_env: bool,
) -> Vec<(String, String)> {
    if !inject_app_runtime_env {
        return env_vars;
    }

    let mut map: HashMap<String, String> = env_vars.into_iter().collect();
    if port > 0 {
        map.entry("PORT".to_string())
            .or_insert_with(|| port.to_string());
    }
    map.entry("HOST".to_string())
        .or_insert_with(|| "0.0.0.0".to_string());
    map.into_iter().collect()
}

pub fn docker_run(spec: &RunSpec, mut logger: Option<&mut TaskLogger>) -> Result<String, String> {
    if let Some(logger) = logger.as_mut() {
        let container_port = if spec.container_port > 0 {
            spec.container_port
        } else {
            spec.port
        };
        logger.info(format!(
            "Starting container {} on host port {} -> container port {} using image {}",
            spec.container_name, spec.port, container_port, spec.image
        ));
    }
    if spec.storage_enabled && !spec.host_data_path.is_empty() {
        std::fs::create_dir_all(&spec.host_data_path)
            .map_err(|e| format!("failed to create data dir {}: {e}", spec.host_data_path))?;
    }

    remove_container(&spec.container_name)?;
    if !spec.skip_pull {
        if let Some(logger) = logger.as_mut() {
            logger.info(format!("Pulling image {}", spec.image));
        }
        if let Err(err) = docker_pull(&spec.image) {
            if let Some(logger) = logger.as_mut() {
                logger.error(&err);
            }
            return Err(err);
        }
    }

    let mut effective_spec = spec.clone();
    let runtime_port = if spec.container_port > 0 {
        spec.container_port
    } else {
        spec.port
    };
    effective_spec.env_vars = runtime_env_vars(
        runtime_port,
        spec.env_vars.clone(),
        effective_spec.inject_app_runtime_env,
    );
    let mut cmd = Command::new("docker");
    for arg in build_run_args(&effective_spec) {
        cmd.arg(arg);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run docker run: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if let Some(logger) = logger.as_mut() {
            logger.error(format!("docker run failed: {stderr}"));
        }
        return Err(format!("docker run failed: {stderr}"));
    }

    let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let resolved_id = if container_id.is_empty() {
        inspect_container_id(&spec.container_name)
            .ok_or_else(|| "container started but id missing".to_string())?
    } else {
        container_id
    };
    if let Some(logger) = logger.as_mut() {
        logger.info(format!(
            "Container started ({})",
            &resolved_id[..12.min(resolved_id.len())]
        ));
        if let Ok(logs) = fetch_container_logs(&spec.container_name, 0) {
            logger.output("container startup", &logs);
        }
    }
    Ok(resolved_id)
}

#[allow(dead_code)]
fn rename_container(current_name: &str, new_name: &str) -> Result<(), String> {
    let output = Command::new("docker")
        .args(["rename", current_name, new_name])
        .output()
        .map_err(|e| format!("failed to run docker rename: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "docker rename failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[allow(dead_code)]
fn inspect_container_state(name: &str) -> Result<(bool, String), String> {
    let output = Command::new("docker")
        .args([
            "inspect",
            "-f",
            "{{.State.Running}} {{if .State.Health}}
              {{.State.Health.Status}}{{else}}none{{end}}",
            name,
        ])
        .output()
        .map_err(|e| {
            format!(
                "failed to inspect container {name}:
          {e}"
            )
        })?;

    if !output.status.success() {
        return Err(format!(
            "failed to inspect container {name}: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let value = String::from_utf8_lossy(&output.stdout);
    let mut parts = value.split_whitespace();
    let running = parts.next() == Some("true");
    let health = parts.next().unwrap_or("none").to_string();

    Ok((running, health))
}

pub fn docker_start(name: &str) -> Result<String, String> {
    let output = Command::new("docker")
        .args(["start", name])
        .output()
        .map_err(|e| format!("failed to run docker start: {e}"))?;
    if output.status.success() {
        inspect_container_id(name).ok_or_else(|| "container started but id missing".to_string())
    } else {
        Err(format!(
            "docker start failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

pub fn docker_stop(name: &str) -> Result<(), String> {
    if !container_exists(name) {
        return Ok(());
    }
    let output = Command::new("docker")
        .args(["stop", name])
        .output()
        .map_err(|e| format!("failed to run docker stop: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "docker stop failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

pub fn docker_restart(name: &str) -> Result<String, String> {
    if !container_exists(name) {
        return Err("container not found for restart".to_string());
    }
    let output = Command::new("docker")
        .args(["restart", name])
        .output()
        .map_err(|e| format!("failed to run docker restart: {e}"))?;
    if output.status.success() {
        inspect_container_id(name).ok_or_else(|| "container restarted but id missing".to_string())
    } else {
        Err(format!(
            "docker restart failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerMetricReport {
    pub service_id: String,
    pub cpu_percent: f32,
    pub memory_used_mb: f32,
    pub memory_limit_mb: f32,
    pub restart_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_status: Option<String>,
}

fn parse_percent(value: &str) -> Option<f32> {
    let trimmed = value.trim().trim_end_matches('%');
    trimmed.parse::<f32>().ok()
}

fn parse_memory_size_mb(value: &str) -> Option<f32> {
    let token = value.split_whitespace().next()?;
    let upper = token.to_uppercase();
    let (number, unit) = if let Some(num) = upper.strip_suffix("GIB") {
        (num.parse::<f32>().ok()?, "GIB")
    } else if let Some(num) = upper.strip_suffix("GB") {
        (num.parse::<f32>().ok()?, "GB")
    } else if let Some(num) = upper.strip_suffix("MIB") {
        (num.parse::<f32>().ok()?, "MIB")
    } else if let Some(num) = upper.strip_suffix("MB") {
        (num.parse::<f32>().ok()?, "MB")
    } else if let Some(num) = upper.strip_suffix("KIB") {
        (num.parse::<f32>().ok()?, "KIB")
    } else {
        return None;
    };

    Some(match unit {
        "GIB" | "GB" => number * 1024.0,
        "MIB" | "MB" => number,
        "KIB" => number / 1024.0,
        _ => number,
    })
}

fn parse_mem_usage(value: &str) -> Option<(f32, f32)> {
    let parts: Vec<&str> = value.split('/').collect();
    if parts.len() != 2 {
        return None;
    }
    let used = parse_memory_size_mb(parts[0])?;
    let limit = parse_memory_size_mb(parts[1])?;
    Some((used, limit))
}

pub fn collect_managed_container_stats() -> Vec<ContainerMetricReport> {
    let list_output = match Command::new("docker")
        .args(["ps", "-q", "--filter", "label=clarklab.managed=true"])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    let ids: Vec<String> = String::from_utf8_lossy(&list_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect();

    let mut reports = Vec::new();
    for id in ids {
        let inspect_output = match Command::new("docker")
            .args([
                "inspect",
                "-f",
                "{{index .Config.Labels \"clarklab.service_id\"}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{end}}",
                &id,
            ])
            .output()
        {
            Ok(output) if output.status.success() => output,
            _ => continue,
        };

        let inspect_line = String::from_utf8_lossy(&inspect_output.stdout);
        let mut parts = inspect_line.split_whitespace();
        let service_id = parts.next().unwrap_or("").to_string();
        if service_id.is_empty() {
            continue;
        }
        let restart_count = parts
            .next()
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        let health_status = parts.next().map(|value| value.to_string());

        let stats_output = match Command::new("docker")
            .args([
                "stats",
                "--no-stream",
                "--format",
                "{{.CPUPerc}}\t{{.MemUsage}}",
                &id,
            ])
            .output()
        {
            Ok(output) if output.status.success() => output,
            _ => continue,
        };

        let stats_line = String::from_utf8_lossy(&stats_output.stdout);
        let mut stats_parts = stats_line.split('\t');
        let cpu_percent = stats_parts.next().and_then(parse_percent).unwrap_or(0.0);
        let memory = stats_parts
            .next()
            .and_then(parse_mem_usage)
            .unwrap_or((0.0, 0.0));

        reports.push(ContainerMetricReport {
            service_id,
            cpu_percent,
            memory_used_mb: memory.0,
            memory_limit_mb: memory.1,
            restart_count,
            health_status,
        });
    }

    reports
}

pub fn list_managed_containers() -> Vec<(String, String)> {
    let list_output = match Command::new("docker")
        .args(["ps", "-q", "--filter", "label=clarklab.managed=true"])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    let ids: Vec<String> = String::from_utf8_lossy(&list_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect();

    let mut containers = Vec::new();
    for id in ids {
        let inspect_output = match Command::new("docker")
            .args([
                "inspect",
                "-f",
                "{{.Name}}\t{{index .Config.Labels \"clarklab.service_id\"}}",
                &id,
            ])
            .output()
        {
            Ok(output) if output.status.success() => output,
            _ => continue,
        };
        let line = String::from_utf8_lossy(&inspect_output.stdout);
        let mut parts = line.split('\t');
        let name = parts
            .next()
            .unwrap_or("")
            .trim()
            .trim_start_matches('/')
            .to_string();
        let service_id = parts.next().unwrap_or("").trim().to_string();
        if name.is_empty() || service_id.is_empty() {
            continue;
        }
        containers.push((name, service_id));
    }
    containers
}

pub fn fetch_container_logs(container_name: &str, since_unix: i64) -> Result<String, String> {
    let output = if since_unix > 0 {
        let since = since_unix.to_string();
        Command::new("docker")
            .args(["logs", "--since", &since, "--timestamps", container_name])
            .output()
    } else {
        Command::new("docker")
            .args(["logs", "--tail", "80", "--timestamps", container_name])
            .output()
    }
    .map_err(|e| format!("failed to read docker logs: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(format!("{stdout}{stderr}"))
}

pub fn collect_service_logs(cursors: &mut ContainerLogCursors) -> Vec<ServiceLogLine> {
    let mut lines = Vec::new();
    for (container_name, service_id) in list_managed_containers() {
        let since_unix = cursors.since_unix(&container_name);
        let Ok(raw) = fetch_container_logs(&container_name, since_unix) else {
            continue;
        };
        cursors.mark_fetched(&container_name);

        for line in raw
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .take(40)
        {
            let (level, message) = classify_container_log_line(line);
            lines.push(ServiceLogLine {
                service_id: service_id.clone(),
                level: level.to_string(),
                message,
            });
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mem_usage_splits_used_and_limit() {
        let parsed = parse_mem_usage("256MiB / 512MiB").expect("memory");
        assert!((parsed.0 - 256.0).abs() < 0.1);
        assert!((parsed.1 - 512.0).abs() < 0.1);
    }

    #[test]
    fn parse_percent_strips_suffix() {
        assert!((parse_percent("12.5%").unwrap() - 12.5).abs() < 0.01);
    }

    #[test]
    fn build_run_args_maps_host_port_to_container_port() {
        let spec = RunSpec {
            container_name: "clarklab-mongo".to_string(),
            image: "mongo:7".to_string(),
            port: 2994,
            container_port: 27017,
            env_vars: vec![],
            storage_enabled: true,
            mount_path: "/data/db".to_string(),
            host_data_path: "/var/lib/clarklab/services/env-1/data".to_string(),
            service_id: "svc-1".to_string(),
            skip_pull: false,
            restart_policy: "unless-stopped".to_string(),
            health_check: String::new(),
            inject_app_runtime_env: false,
            entrypoint: None,
            command: vec![],
        };
        let args = build_run_args(&spec);
        assert!(args.contains(&"0.0.0.0:2994:27017".to_string()));
    }

    #[test]
    fn build_run_args_zero_host_port_skips_port_mapping() {
        let spec = RunSpec {
            container_name: "clarklab-data".to_string(),
            image: "redis:7-alpine".to_string(),
            port: 0,
            container_port: 0,
            env_vars: vec![],
            storage_enabled: true,
            mount_path: "/data".to_string(),
            host_data_path: "/var/lib/clarklab/services/env-1/data".to_string(),
            service_id: "svc-1".to_string(),
            skip_pull: false,
            restart_policy: "unless-stopped".to_string(),
            health_check: String::new(),
            inject_app_runtime_env: false,
            entrypoint: None,
            command: vec![],
        };
        let args = build_run_args(&spec);
        assert!(!args.contains(&"-p".to_string()));
    }

    #[test]
    fn build_run_args_includes_port_and_labels() {
        let spec = RunSpec {
            container_name: "clarklab-test".to_string(),
            image: "mysql:8".to_string(),
            port: 3306,
            container_port: 3306,
            env_vars: vec![("MYSQL_ROOT_PASSWORD".to_string(), "secret".to_string())],
            storage_enabled: true,
            mount_path: "/var/lib/mysql".to_string(),
            host_data_path: "/var/lib/clarklab/services/env-1/data".to_string(),
            service_id: "svc-1".to_string(),
            skip_pull: false,
            restart_policy: "unless-stopped".to_string(),
            health_check: String::new(),
            inject_app_runtime_env: false,
            entrypoint: None,
            command: vec![],
        };
        let args = build_run_args(&spec);
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"0.0.0.0:3306:3306".to_string()));
        assert!(args.contains(&"mysql:8".to_string()));
        assert!(args.iter().any(|a| a.contains("clarklab.service_id=svc-1")));
    }

    #[test]
    fn build_run_args_includes_health_check_when_configured() {
        let spec = RunSpec {
            container_name: "clarklab-app".to_string(),
            image: "node:22-alpine".to_string(),
            port: 3000,
            container_port: 3000,
            env_vars: vec![],
            storage_enabled: false,
            mount_path: String::new(),
            host_data_path: String::new(),
            service_id: "svc-1".to_string(),
            skip_pull: false,
            restart_policy: "unless-stopped".to_string(),
            health_check: "curl -f http://localhost:3000/health || exit 1".to_string(),
            inject_app_runtime_env: true,
            entrypoint: None,
            command: vec![],
        };
        let args = build_run_args(&spec);
        assert!(args.contains(&"--health-cmd".to_string()));
        assert!(args.contains(&"curl -f http://localhost:3000/health || exit 1".to_string()));
        assert!(args.contains(&"--health-interval".to_string()));
    }

    #[test]
    fn build_run_args_skips_health_check_when_empty() {
        let spec = RunSpec {
            container_name: "clarklab-app".to_string(),
            image: "node:22-alpine".to_string(),
            port: 3000,
            container_port: 3000,
            env_vars: vec![],
            storage_enabled: false,
            mount_path: String::new(),
            host_data_path: String::new(),
            service_id: "svc-1".to_string(),
            skip_pull: false,
            restart_policy: "unless-stopped".to_string(),
            health_check: String::new(),
            inject_app_runtime_env: true,
            entrypoint: None,
            command: vec![],
        };
        let args = build_run_args(&spec);
        assert!(!args.contains(&"--health-cmd".to_string()));
    }

    #[test]
    fn runtime_env_vars_injects_port_and_host() {
        let vars = runtime_env_vars(
            2994,
            vec![("NODE_ENV".to_string(), "production".to_string())],
            true,
        );
        let map: HashMap<String, String> = vars.into_iter().collect();
        assert_eq!(map.get("PORT"), Some(&"2994".to_string()));
        assert_eq!(map.get("HOST"), Some(&"0.0.0.0".to_string()));
        assert_eq!(map.get("NODE_ENV"), Some(&"production".to_string()));
    }

    #[test]
    fn runtime_env_vars_skips_app_defaults_for_databases() {
        let vars = runtime_env_vars(
            2994,
            vec![(
                "MONGO_INITDB_ROOT_USERNAME".to_string(),
                "clarklab".to_string(),
            )],
            false,
        );
        let map: HashMap<String, String> = vars.into_iter().collect();
        assert!(!map.contains_key("PORT"));
        assert!(!map.contains_key("HOST"));
        assert_eq!(
            map.get("MONGO_INITDB_ROOT_USERNAME"),
            Some(&"clarklab".to_string())
        );
    }

    #[test]
    fn runtime_env_vars_respect_existing_port() {
        let vars = runtime_env_vars(2994, vec![("PORT".to_string(), "8080".to_string())], true);
        let map: HashMap<String, String> = vars.into_iter().collect();
        assert_eq!(map.get("PORT"), Some(&"8080".to_string()));
    }
}
