use crate::config::AGENT_VERSION;
use crate::docker::ContainerMetricReport;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::Instant;
use sysinfo::{Components, Disk, Disks, Networks, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub token: String,
    pub hostname: String,
    pub ip: String,
    pub agent_version: String,
    pub docker_version: String,
    pub os: String,
    pub architecture: String,
    pub cpu_cores: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub node_id: String,
    pub agent_token: String,
    pub heartbeat_interval_seconds: Option<u64>,
    #[serde(default)]
    pub data_root: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRequest {
    pub cpu_percent: f32,
    pub cpu_cores: u32,
    pub memory_used_mb: f32,
    pub memory_total_mb: f32,
    pub disk_used_gb: f32,
    pub disk_total_gb: f32,
    pub docker_version: String,
    pub network_rx_mbps: Option<f32>,
    pub network_tx_mbps: Option<f32>,
    pub temperature_c: Option<f32>,
    pub uptime_seconds: u64,
    pub reported_data_root: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_ip: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub containers: Vec<ContainerMetricReport>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub service_logs: Vec<crate::service_log::ServiceLogLine>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub agent_logs: Vec<crate::agent_log::AgentLogLine>,
    pub agent_version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEnvVar {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub is_secret: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStorage {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub mount_path: String,
    #[serde(default)]
    pub host_data_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployTask {
    pub id: String,
    pub action: String,
    pub service_id: String,
    pub service_name: String,
    pub service_environment_id: String,
    pub environment: String,
    pub port: Option<u32>,
    pub image: String,
    pub container_name: String,
    #[serde(default)]
    pub existing_container_id: String,
    #[serde(default)]
    pub template_id: String,
    #[serde(default)]
    pub source_type: String,
    #[serde(default)]
    pub env_vars: Vec<TaskEnvVar>,
    pub storage: TaskStorage,
    #[serde(default)]
    pub payload: serde_json::Value,
    #[serde(default)]
    pub repository: String,
    #[serde(default)]
    pub branch: String,
    #[serde(default)]
    pub root_directory: String,
    #[serde(default)]
    pub repository_url: String,
    #[serde(default)]
    pub git_http_header: String,
    #[serde(default)]
    pub commit_sha: String,
    #[serde(default)]
    pub deploy_config: serde_json::Value,
    #[serde(default)]
    pub start_command: String,
    #[serde(default)]
    pub build_command: String,
    #[serde(default)]
    pub install_command: String,
    #[serde(default)]
    pub restart_policy: String,
    #[serde(default)]
    pub container_port: Option<u32>,
}

impl DeployTask {
    pub fn effective_source_type(&self) -> &str {
        if self.source_type == "git" {
            return "git";
        }
        if !self.repository.trim().is_empty() {
            return "git";
        }
        if let Some(value) = self.deploy_config.get("sourceType").and_then(|v| v.as_str()) {
            if value == "git" {
                return "git";
            }
        }
        if self
            .deploy_config
            .get("repository")
            .and_then(|v| v.as_str())
            .is_some_and(|value| !value.trim().is_empty())
        {
            return "git";
        }
        if self.source_type.is_empty() {
            "database"
        } else {
            self.source_type.as_str()
        }
    }

    pub fn repository_or_config(&self) -> String {
        if !self.repository.trim().is_empty() {
            return self.repository.clone();
        }
        self.deploy_config
            .get("repository")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    }

    pub fn branch_or_config(&self) -> String {
        if !self.branch.trim().is_empty() {
            return self.branch.clone();
        }
        self.deploy_config
            .get("branch")
            .and_then(|v| v.as_str())
            .unwrap_or("main")
            .to_string()
    }

    pub fn root_directory_or_config(&self) -> String {
        if !self.root_directory.trim().is_empty() {
            return self.root_directory.clone();
        }
        self.deploy_config
            .get("rootDirectory")
            .and_then(|v| v.as_str())
            .unwrap_or("/")
            .to_string()
    }

    pub fn nixpacks_options(&self) -> crate::build::NixpacksOptions {
        crate::build::NixpacksOptions {
            start_command: self.command_or_config("start_command", "startCommand"),
            build_command: self.command_or_config("build_command", "buildCommand"),
            install_command: self.command_or_config("install_command", "installCommand"),
        }
    }

    pub fn docker_restart_policy(&self) -> String {
        if !self.restart_policy.trim().is_empty() {
            return self.restart_policy.trim().to_string();
        }
        if let Some(value) = self
            .deploy_config
            .get("restart")
            .and_then(|restart| restart.get("autoRestart"))
            .and_then(|value| value.as_bool())
        {
            if !value {
                return "no".to_string();
            }
        }
        "unless-stopped".to_string()
    }

    fn command_or_config(&self, field: &str, config_key: &str) -> Option<String> {
        let direct = match field {
            "start_command" => &self.start_command,
            "build_command" => &self.build_command,
            "install_command" => &self.install_command,
            _ => return None,
        };
        if !direct.trim().is_empty() {
            return Some(direct.clone());
        }
        self.deploy_config
            .get(config_key)
            .and_then(|value| value.as_str())
            .map(str::to_string)
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUpdateTask {
    pub id: String,
    pub repository: String,
    pub branch: String,
    pub root_directory: String,
    #[serde(default)]
    pub commit_sha: String,
    pub repository_url: String,
    pub git_http_header: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUpdateCompleteRequest {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatResponse {
    pub heartbeat_interval_seconds: u64,
    #[serde(default)]
    pub pending_tasks: Vec<DeployTask>,
    #[serde(default)]
    pub pending_agent_update: Option<AgentUpdateTask>,
    #[serde(default)]
    pub data_root: Option<String>,
    #[serde(default)]
    pub migrate_data: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCompleteRequest {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deployment_id: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub logs: Vec<crate::service_log::TaskLogEntry>,
}

pub fn detect_docker_version() -> String {
    match Command::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
    {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => "unavailable".to_string(),
    }
}

fn primary_disk<'a>(disks: &'a [Disk]) -> Option<&'a Disk> {
    disks
        .iter()
        .find(|disk| disk.mount_point() == Path::new("/System/Volumes/Data"))
        .or_else(|| disks.iter().find(|disk| disk.mount_point() == Path::new("/")))
}

fn disk_usage_bytes(disks: &Disks) -> (u64, u64) {
    if let Some(disk) = primary_disk(disks.list()) {
        let total = disk.total_space();
        let used = total.saturating_sub(disk.available_space());
        return (used, total);
    }

    disks
        .list()
        .iter()
        .filter(|disk| !disk.is_removable())
        .max_by_key(|disk| disk.total_space())
        .map(|disk| {
            let total = disk.total_space();
            let used = total.saturating_sub(disk.available_space());
            (used, total)
        })
        .unwrap_or((0, 0))
}

fn collect_temperature() -> Option<f32> {
    let components = Components::new_with_refreshed_list();
    let temps: Vec<f32> = components
        .iter()
        .filter_map(|component| component.temperature())
        .collect();
    if temps.is_empty() {
        None
    } else {
        Some(temps.iter().sum::<f32>() / temps.len() as f32)
    }
}

fn collect_network_mbps(last: &mut Option<(u64, u64, Instant)>) -> (Option<f32>, Option<f32>) {
    let networks = Networks::new_with_refreshed_list();
    let mut received = 0u64;
    let mut transmitted = 0u64;
    for (_name, network) in &networks {
        received += network.total_received();
        transmitted += network.total_transmitted();
    }

    let now = Instant::now();
    let rates = if let Some((prev_rx, prev_tx, prev_at)) = last.as_ref() {
        let seconds = now.duration_since(*prev_at).as_secs_f32();
        if seconds > 0.0 {
            let rx_mbps = (received.saturating_sub(*prev_rx) as f32 * 8.0) / seconds / 1_000_000.0;
            let tx_mbps =
                (transmitted.saturating_sub(*prev_tx) as f32 * 8.0) / seconds / 1_000_000.0;
            (Some(rx_mbps), Some(tx_mbps))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    *last = Some((received, transmitted, now));
    rates
}

pub fn collect_metrics(
    last_network: &mut Option<(u64, u64, Instant)>,
    reported_data_root: &str,
    agent_version: &str,
) -> HeartbeatRequest {
    let mut system = System::new_all();
    system.refresh_all();

    let cpu_percent = system.global_cpu_usage();
    let cpu_cores = system.cpus().len() as u32;
    let memory_total_mb = system.total_memory() as f32 / 1024.0 / 1024.0;
    let memory_used_mb = system.used_memory() as f32 / 1024.0 / 1024.0;

    let disks = Disks::new_with_refreshed_list();
    let (disk_used, disk_total) = disk_usage_bytes(&disks);
    let (network_rx_mbps, network_tx_mbps) = collect_network_mbps(last_network);

    HeartbeatRequest {
        cpu_percent,
        cpu_cores,
        memory_used_mb,
        memory_total_mb,
        disk_used_gb: disk_used as f32 / 1024.0 / 1024.0 / 1024.0,
        disk_total_gb: disk_total as f32 / 1024.0 / 1024.0 / 1024.0,
        docker_version: detect_docker_version(),
        network_rx_mbps,
        network_tx_mbps,
        temperature_c: collect_temperature(),
        uptime_seconds: System::uptime(),
        reported_data_root: reported_data_root.to_string(),
        local_ip: local_ip_address::local_ip().ok().map(|ip| ip.to_string()),
        containers: Vec::new(),
        service_logs: Vec::new(),
        agent_logs: Vec::new(),
        agent_version: agent_version.to_string(),
    }
}

pub fn build_register_request(token: String) -> RegisterRequest {
    let mut system = System::new_all();
    system.refresh_all();

    RegisterRequest {
        token,
        hostname: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
        ip: local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "—".to_string()),
        agent_version: AGENT_VERSION.to_string(),
        docker_version: detect_docker_version(),
        os: System::name().unwrap_or_else(|| "Linux".to_string()),
        architecture: std::env::consts::ARCH.to_string(),
        cpu_cores: system.cpus().len() as u32,
    }
}