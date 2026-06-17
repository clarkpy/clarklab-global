use crate::service_log::TaskLogger;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn build_context_path(source_root: &Path, root_directory: &str) -> PathBuf {
    let trimmed = root_directory.trim().trim_matches('/');
    if trimmed.is_empty() {
        source_root.to_path_buf()
    } else {
        source_root.join(trimmed)
    }
}

fn sanitize_remote_url(repository_url: &str, dest: &Path, logger: &mut TaskLogger) {
    let clean_url = repository_url.trim();
    if clean_url.is_empty() {
        return;
    }

    let output = Command::new("git")
        .current_dir(dest)
        .args(["remote", "set-url", "origin", clean_url])
        .output();

    match output {
        Ok(result) if result.status.success() => {
            logger.info("Repository remote URL sanitized");
        }
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            logger.error(format!("failed to sanitize git remote URL: {stderr}"));
        }
        Err(err) => {
            logger.error(format!("failed to run git remote set-url: {err}"));
        }
    }
}

pub fn clone_repo(
    repository_url: &str,
    git_http_header: Option<&str>,
    dest: &Path,
    branch: &str,
    commit_sha: Option<&str>,
    logger: &mut TaskLogger,
) -> Result<(), String> {
    if !git_available() {
        return Err("git is not installed on this node".to_string());
    }

    let clean_url = repository_url.trim();
    if clean_url.is_empty() {
        return Err("missing repository URL".to_string());
    }

    if dest.exists() {
        std::fs::remove_dir_all(dest)
            .map_err(|e| format!("failed to clear clone directory: {e}"))?;
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create clone parent directory: {e}"))?;
    }

    let dest_str = dest
        .to_str()
        .ok_or_else(|| "invalid clone destination path".to_string())?;

    logger.info(format!("Cloning repository (branch {branch})"));

    let mut command = Command::new("git");
    if let Some(header) = git_http_header.filter(|value| !value.trim().is_empty()) {
        command.arg("-c").arg(format!("http.extraHeader={header}"));
    }

    let output = command
        .args([
            "clone",
            "--depth",
            "1",
            "--branch",
            branch,
            clean_url,
            dest_str,
        ])
        .output()
        .map_err(|e| format!("failed to run git clone: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        logger.error("git clone failed");
        return Err(format!("git clone failed: {stderr}"));
    }

    sanitize_remote_url(clean_url, dest, logger);

    if let Some(sha) = commit_sha.filter(|value| !value.is_empty()) {
        logger.info(format!("Checking out commit {sha}"));
        let fetch = Command::new("git")
            .current_dir(dest)
            .args(["fetch", "origin", sha, "--depth", "1"])
            .output()
            .map_err(|e| format!("failed to run git fetch: {e}"))?;
        if !fetch.status.success() {
            let stderr = String::from_utf8_lossy(&fetch.stderr);
            logger.error(format!("git fetch commit failed: {stderr}"));
            return Err(format!("git fetch commit failed: {stderr}"));
        }

        let checkout = Command::new("git")
            .current_dir(dest)
            .args(["checkout", sha])
            .output()
            .map_err(|e| format!("failed to run git checkout: {e}"))?;
        if !checkout.status.success() {
            let stderr = String::from_utf8_lossy(&checkout.stderr);
            logger.error(format!("git checkout failed: {stderr}"));
            return Err(format!("git checkout failed: {stderr}"));
        }
    }

    logger.info("Repository cloned successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_context_path_uses_root_when_empty() {
        let root = Path::new("/data/source");
        assert_eq!(build_context_path(root, "/"), root);
        assert_eq!(build_context_path(root, ""), root);
    }

    #[test]
    fn build_context_path_joins_subdirectory() {
        let root = Path::new("/data/source");
        assert_eq!(
            build_context_path(root, "apps/api"),
            Path::new("/data/source/apps/api")
        );
    }
}
