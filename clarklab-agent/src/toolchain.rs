use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_CARGO_HOME: &str = "/usr/local/cargo";
const DEFAULT_RUSTUP_HOME: &str = "/usr/local/rustup";

pub fn resolve_cargo_path() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("CLARKLAB_CARGO") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Ok(candidate);
        }
        return Err(format!(
            "CLARKLAB_CARGO is set but not found: {}",
            candidate.display()
        ));
    }

    for candidate in [
        "/usr/local/bin/cargo",
        "/usr/local/cargo/bin/cargo",
        "/usr/bin/cargo",
    ] {
        let path = Path::new(candidate);
        if path.is_file() {
            return Ok(path.to_path_buf());
        }
    }

    if let Ok(output) = Command::new("sh")
        .args(["-c", "command -v cargo"])
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).is_file() {
                return Ok(PathBuf::from(path));
            }
        }
    }

    Err(
        "cargo is not installed for the agent service. On the node, re-run scripts/install.sh to install a system Rust toolchain.".to_string(),
    )
}

pub fn configure_toolchain_command(mut command: Command) -> Command {
    if std::env::var_os("CARGO_HOME")
        .filter(|value| !value.is_empty())
        .is_none()
        && Path::new(DEFAULT_CARGO_HOME).exists()
    {
        command.env("CARGO_HOME", DEFAULT_CARGO_HOME);
    }

    if std::env::var_os("RUSTUP_HOME")
        .filter(|value| !value.is_empty())
        .is_none()
        && Path::new(DEFAULT_RUSTUP_HOME).exists()
    {
        command.env("RUSTUP_HOME", DEFAULT_RUSTUP_HOME);
    }

    let path = std::env::var("PATH").unwrap_or_default();
    if !path.split(':').any(|entry| entry == "/usr/local/bin") {
        command.env("PATH", format!("/usr/local/bin:/usr/bin:/bin:{path}"));
    }

    command
}

pub fn cargo_command() -> Result<Command, String> {
    let cargo = resolve_cargo_path()?;
    Ok(configure_toolchain_command(Command::new(cargo)))
}
