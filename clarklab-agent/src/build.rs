use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::service_log::TaskLogger;

const NIXPACKS_INSTALL_HINT: &str = "nixpacks is not installed on this node. Install it with: curl -sSL https://nixpacks.com/install.sh | bash -s -- -y (or re-run install.sh)";

const NO_START_COMMAND_HINT: &str = "No start command could be found. Add a \"start\" script to package.json, set the service root directory to the app folder (for monorepos), or configure a start command when creating the service.";

#[derive(Debug, Default, Clone)]
pub struct NixpacksOptions {
    pub start_command: Option<String>,
    pub build_command: Option<String>,
    pub install_command: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct ResolvedCommands {
    start_command: Option<String>,
    build_command: Option<String>,
    install_command: Option<String>,
}

pub fn nixpacks_build(
    source_dir: &str,
    image_name: &str,
    options: &NixpacksOptions,
    logger: &mut TaskLogger,
) -> Result<(), String> {
    let commands = resolve_commands(source_dir, options)?;
    let platform = nixpacks_platform();
    logger.info(format!("Generating Nixpacks build plan for {source_dir}"));
    let dockerfile = generate_nixpacks_dockerfile(source_dir, &platform, &commands, logger)?;
    patch_nixpacks_dockerfile(&dockerfile, commands.build_command.is_some())?;
    logger.info(format!("Building Docker image {image_name} ({platform})"));
    docker_build_image(source_dir, &dockerfile, image_name, &platform, logger)
}

fn generate_nixpacks_dockerfile(
    source_dir: &str,
    platform: &str,
    commands: &ResolvedCommands,
    logger: &mut TaskLogger,
) -> Result<PathBuf, String> {
    let mut args = vec![
        "build".to_string(),
        source_dir.to_string(),
        "-o".to_string(),
        source_dir.to_string(),
        "--platform".to_string(),
        platform.to_string(),
    ];

    if let Some(install_command) = &commands.install_command {
        args.push("--install-cmd".to_string());
        args.push(install_command.clone());
    }
    if let Some(build_command) = &commands.build_command {
        args.push("--build-cmd".to_string());
        args.push(build_command.clone());
    }
    if let Some(start_command) = &commands.start_command {
        args.push("--start-cmd".to_string());
        args.push(start_command.clone());
    }

    let output = run_nixpacks(&args)?;
    if !output.status.success() {
        logger.output("nixpacks plan", &format_nixpacks_output(&output));
        return Err(format_nixpacks_failure("nixpacks plan failed", &output));
    }

    logger.info("Nixpacks build plan ready");

    let dockerfile = Path::new(source_dir).join(".nixpacks/Dockerfile");
    if !dockerfile.is_file() {
        return Err(format!(
            "nixpacks did not generate a Dockerfile at {}",
            dockerfile.display()
        ));
    }

    Ok(dockerfile)
}

fn patch_nixpacks_dockerfile(dockerfile: &Path, include_build: bool) -> Result<(), String> {
    let raw = std::fs::read_to_string(dockerfile)
        .map_err(|e| format!("failed to read {}: {e}", dockerfile.display()))?;
    let mut patched = raw.replace(" && nix-collect-garbage -d", "");
    if !include_build {
        patched = patched
            .lines()
            .filter(|line| !line.contains("npm run build"))
            .collect::<Vec<_>>()
            .join("\n");
    }
    if patched == raw {
        return Ok(());
    }
    std::fs::write(dockerfile, patched)
        .map_err(|e| format!("failed to patch {}: {e}", dockerfile.display()))
}

fn docker_build_image(
    source_dir: &str,
    dockerfile: &Path,
    image_name: &str,
    platform: &str,
    logger: &mut TaskLogger,
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;

    let mut child = Command::new("docker")
        .args([
            "build",
            "--progress=plain",
            "--platform",
            platform,
            "-f",
            dockerfile
                .to_str()
                .ok_or_else(|| "dockerfile path is not valid UTF-8".to_string())?,
            "-t",
            image_name,
            source_dir,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run docker build: {e}"))?;

    logger.info("docker build:");

    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let line = line.map_err(|e| format!("failed to read docker build output: {e}"))?;
            let trimmed = line.trim_end();
            if !trimmed.is_empty() {
                logger.info(trimmed.to_string());
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait for docker build: {e}"))?;

    if status.success() {
        logger.info(format!("Docker image built: {image_name}"));
        Ok(())
    } else {
        Err("docker build failed".to_string())
    }
}

fn format_nixpacks_output(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    format!(
        "{}{}",
        stderr.trim(),
        if stdout.trim().is_empty() {
            String::new()
        } else {
            format!("\n{}", stdout.trim())
        }
    )
}

fn run_nixpacks(args: &[String]) -> Result<std::process::Output, String> {
    Command::new("nixpacks")
        .args(args)
        .output()
        .map_err(|e| {
            if e.kind() == io::ErrorKind::NotFound {
                NIXPACKS_INSTALL_HINT.to_string()
            } else {
                format!("failed to run nixpacks: {e}")
            }
        })
}

fn format_nixpacks_failure(prefix: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!(
        "{}{}",
        stderr.trim(),
        if stdout.trim().is_empty() {
            String::new()
        } else {
            format!("\n{}", stdout.trim())
        }
    );
    format!("{prefix}: {combined}{}", orbstack_gc_hint(&combined))
}

fn nixpacks_platform() -> String {
    if let Ok(platform) = std::env::var("CLARKLAB_NIXPACKS_PLATFORM") {
        let trimmed = platform.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    if std::env::consts::ARCH == "aarch64" {
        "linux/arm64".to_string()
    } else {
        "linux/amd64".to_string()
    }
}

fn orbstack_gc_hint(output: &str) -> String {
    if output.contains("nix-collect-garbage")
        && output.contains("Operation not permitted")
    {
        return "\n\nHint: this is a known OrbStack issue with Nixpacks garbage collection inside Docker builds. Rebuild the Clarklab agent to apply the Dockerfile patch workaround.".to_string();
    }
    String::new()
}

fn resolve_commands(source_dir: &str, options: &NixpacksOptions) -> Result<ResolvedCommands, String> {
    let scripts = read_package_scripts(source_dir).unwrap_or_default();
    let mut resolved = ResolvedCommands {
        start_command: trim_option(options.start_command.clone()),
        build_command: resolve_build_command(&scripts, trim_option(options.build_command.clone())),
        install_command: trim_option(options.install_command.clone()),
    };

    if resolved.start_command.is_none() {
        resolved.start_command = infer_start_command(&scripts);
    }

    if resolved.start_command.is_none() {
        return Err(NO_START_COMMAND_HINT.to_string());
    }

    Ok(resolved)
}

fn resolve_build_command(
    scripts: &BTreeMap<String, String>,
    configured: Option<String>,
) -> Option<String> {
    if let Some(command) = configured {
        if let Some(script_name) = npm_run_script_name(&command) {
            if has_script(scripts, script_name) {
                return Some(command);
            }
            return None;
        }
        return Some(command);
    }

    if has_script(scripts, "build") {
        return Some("npm run build".to_string());
    }

    None
}

fn has_script(scripts: &BTreeMap<String, String>, name: &str) -> bool {
    scripts.get(name).is_some_and(|script| !script.trim().is_empty())
}

fn npm_run_script_name(command: &str) -> Option<&str> {
    let trimmed = command.trim();
    let rest = trimmed.strip_prefix("npm run ")?;
    let script_name = rest.split_whitespace().next()?;
    if script_name.is_empty() {
        None
    } else {
        Some(script_name)
    }
}

fn trim_option(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn read_package_scripts(source_dir: &str) -> Result<BTreeMap<String, String>, String> {
    let package_json_path = Path::new(source_dir).join("package.json");
    let raw = std::fs::read_to_string(&package_json_path)
        .map_err(|e| format!("failed to read {}: {e}", package_json_path.display()))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("invalid package.json: {e}"))?;
    let scripts = parsed
        .get("scripts")
        .and_then(|value| value.as_object())
        .ok_or_else(|| "package.json has no scripts section".to_string())?;

    Ok(scripts
        .iter()
        .filter_map(|(key, value)| value.as_str().map(|script| (key.clone(), script.to_string())))
        .collect())
}

fn infer_start_command(scripts: &BTreeMap<String, String>) -> Option<String> {
    if has_script(scripts, "start") {
        return Some("npm run start".to_string());
    }
    if has_script(scripts, "preview") {
        return Some("npm run preview -- --host 0.0.0.0 --port ${PORT:-3000}".to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn patches_nix_collect_garbage_from_dockerfile() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-dockerfile-patch-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(temp.join(".nixpacks")).expect("create nixpacks dir");
        let dockerfile = temp.join(".nixpacks/Dockerfile");
        fs::write(
            &dockerfile,
            "RUN nix-env -if setup.nix && nix-collect-garbage -d\nRUN npm ci\n",
        )
        .expect("write dockerfile");

        patch_nixpacks_dockerfile(&dockerfile, true).expect("patch dockerfile");

        let patched = fs::read_to_string(&dockerfile).expect("read dockerfile");
        assert!(!patched.contains("nix-collect-garbage"));
        assert!(patched.contains("RUN nix-env -if setup.nix"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn infers_start_from_package_json() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-build-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create temp dir");
        fs::write(
            temp.join("package.json"),
            r#"{"scripts":{"build":"tsc","start":"node dist/index.js"}}"#,
        )
        .expect("write package.json");

        let resolved = resolve_commands(temp.to_str().unwrap(), &NixpacksOptions::default())
            .expect("resolve commands");

        assert_eq!(
            resolved,
            ResolvedCommands {
                start_command: Some("npm run start".to_string()),
                build_command: Some("npm run build".to_string()),
                install_command: None,
            }
        );

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn infers_preview_when_start_missing() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-build-preview-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create temp dir");
        fs::write(
            temp.join("package.json"),
            r#"{"scripts":{"build":"vite build","preview":"vite preview"}}"#,
        )
        .expect("write package.json");

        let resolved = resolve_commands(temp.to_str().unwrap(), &NixpacksOptions::default())
            .expect("resolve commands");

        assert_eq!(
            resolved.start_command,
            Some("npm run preview -- --host 0.0.0.0 --port ${PORT:-3000}".to_string())
        );

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn configured_start_command_takes_priority() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-build-override-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create temp dir");
        fs::write(temp.join("package.json"), r#"{"scripts":{"start":"node index.js"}}"#)
            .expect("write package.json");

        let resolved = resolve_commands(
            temp.to_str().unwrap(),
            &NixpacksOptions {
                start_command: Some("node server.js".to_string()),
                ..NixpacksOptions::default()
            },
        )
        .expect("resolve commands");

        assert_eq!(resolved.start_command, Some("node server.js".to_string()));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn missing_start_command_returns_helpful_error() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-build-missing-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create temp dir");
        fs::write(temp.join("package.json"), r#"{"scripts":{"dev":"vite"}}"#)
            .expect("write package.json");

        let err = resolve_commands(temp.to_str().unwrap(), &NixpacksOptions::default())
            .expect_err("expected missing start command error");

        assert!(err.contains("No start command could be found"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn skips_build_when_package_has_no_build_script() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-build-no-build-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(&temp).expect("create temp dir");
        fs::write(
            temp.join("package.json"),
            r#"{"scripts":{"start":"node index.js"}}"#,
        )
        .expect("write package.json");

        let resolved = resolve_commands(
            temp.to_str().unwrap(),
            &NixpacksOptions {
                build_command: Some("npm run build".to_string()),
                ..NixpacksOptions::default()
            },
        )
        .expect("resolve commands");

        assert_eq!(resolved.start_command, Some("npm run start".to_string()));
        assert_eq!(resolved.build_command, None);

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn strips_build_step_from_dockerfile_when_not_needed() {
        let temp = std::env::temp_dir().join(format!(
            "clarklab-dockerfile-strip-build-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(temp.join(".nixpacks")).expect("create nixpacks dir");
        let dockerfile = temp.join(".nixpacks/Dockerfile");
        fs::write(
            &dockerfile,
            "# build phase\nRUN --mount=type=cache npm run build\nRUN npm ci\n",
        )
        .expect("write dockerfile");

        patch_nixpacks_dockerfile(&dockerfile, false).expect("patch dockerfile");

        let patched = fs::read_to_string(&dockerfile).expect("read dockerfile");
        assert!(!patched.contains("npm run build"));
        assert!(patched.contains("RUN npm ci"));

        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn nixpacks_platform_selection() {
        let previous = std::env::var("CLARKLAB_NIXPACKS_PLATFORM").ok();
        std::env::remove_var("CLARKLAB_NIXPACKS_PLATFORM");

        let expected_default = if std::env::consts::ARCH == "aarch64" {
            "linux/arm64"
        } else {
            "linux/amd64"
        };
        assert_eq!(nixpacks_platform(), expected_default);

        std::env::set_var("CLARKLAB_NIXPACKS_PLATFORM", "linux/amd64");
        assert_eq!(nixpacks_platform(), "linux/amd64");

        restore_env_var("CLARKLAB_NIXPACKS_PLATFORM", previous);
    }

    fn restore_env_var(key: &str, value: Option<String>) {
        match value {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
    }
}
