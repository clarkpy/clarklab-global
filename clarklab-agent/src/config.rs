use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::data_root::expand_path;

pub const DEFAULT_DATA_ROOT: &str = "/var/lib/clarklab/services";
pub const DEFAULT_HEARTBEAT_SECONDS: u64 = 30;
pub const MIN_HEARTBEAT_SECONDS: u64 = 5;
pub const MAX_HEARTBEAT_SECONDS: u64 = 300;
pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentConfig {
    pub server_url: String,
    pub node_id: String,
    pub agent_token: String,
    #[serde(default = "default_data_root")]
    pub data_root: String,
}

fn default_data_root() -> String {
    DEFAULT_DATA_ROOT.to_string()
}

pub fn clamp_heartbeat(seconds: u64) -> u64 {
    seconds.clamp(MIN_HEARTBEAT_SECONDS, MAX_HEARTBEAT_SECONDS)
}

pub fn normalize_data_root(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        DEFAULT_DATA_ROOT.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn resolved_data_root(path: &str) -> String {
    expand_path(&normalize_data_root(path))
}

#[cfg(unix)]
fn enforce_private_permissions(path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = std::fs::metadata(path)?;
    let mode = metadata.permissions().mode() & 0o777;
    if mode & 0o077 != 0 {
        return Err(format!(
            "config file {path:?} is readable by group or others (mode {mode:o}); use chmod 600",
        )
        .into());
    }
    Ok(())
}

#[cfg(not(unix))]
fn enforce_private_permissions(_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(unix)]
fn write_private_file(path: &PathBuf, contents: &str) -> Result<(), Box<dyn std::error::Error>> {
    use std::os::unix::fs::OpenOptionsExt;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?
        .write_all(contents.as_bytes())?;

    Ok(())
}

#[cfg(not(unix))]
fn write_private_file(path: &PathBuf, contents: &str) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, contents)?;
    Ok(())
}

use std::io::Write;

pub fn load_config(path: &PathBuf) -> Result<AgentConfig, Box<dyn std::error::Error>> {
    enforce_private_permissions(path)?;
    let raw = std::fs::read_to_string(path)?;
    let mut config: AgentConfig = serde_yaml::from_str(&raw)?;
    config.data_root = normalize_data_root(&config.data_root);
    Ok(config)
}

pub fn save_config(path: &PathBuf, config: &AgentConfig) -> Result<(), Box<dyn std::error::Error>> {
    let contents = serde_yaml::to_string(config)?;
    write_private_file(path, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn normalize_data_root_uses_default_for_empty() {
        assert_eq!(normalize_data_root(""), DEFAULT_DATA_ROOT);
    }

    #[cfg(unix)]
    #[test]
    fn save_config_writes_private_file() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("clarklab-agent-test-{}", std::process::id()));
        let path = dir.join("agent.yaml");
        let _ = fs::remove_dir_all(&dir);

        let config = AgentConfig {
            server_url: "http://localhost:3000".to_string(),
            node_id: "node-1".to_string(),
            agent_token: "token".to_string(),
            data_root: DEFAULT_DATA_ROOT.to_string(),
        };

        save_config(&path, &config).expect("save config");
        let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);

        let _ = fs::remove_dir_all(&dir);
    }
}
