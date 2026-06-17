use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn expand_path(path: &str) -> String {
    let trimmed = path.trim();
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{}/{}", home.trim_end_matches('/'), rest);
        }
    }
    if trimmed == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return home;
        }
    }
    trimmed.to_string()
}

pub fn stop_managed_containers() -> Result<(), String> {
    let output = Command::new("docker")
        .args(["ps", "-aq", "--filter", "label=clarklab.managed=true"])
        .output()
        .map_err(|e| format!("failed to list managed containers: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Cannot connect")
            || stderr.contains("permission denied")
            || stderr.contains("Is the docker daemon running")
        {
            eprintln!("Warning: Docker unavailable; skipping managed container stop before migration");
            return Ok(());
        }
        return Err(format!("failed to list managed containers: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let ids: Vec<String> = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect();

    for id in ids {
        let stop = Command::new("docker").args(["stop", &id]).output();
        if let Ok(result) = stop {
            if !result.status.success() {
                eprintln!(
                    "warning: failed to stop container {id}: {}",
                    String::from_utf8_lossy(&result.stderr)
                );
            }
        }
    }

    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn move_entry(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_dir_all(src, dst).map_err(|e| {
                format!(
                    "failed to copy {} to {}: {e}",
                    src.display(),
                    dst.display()
                )
            })?;
            fs::remove_dir_all(src).map_err(|e| {
                format!("failed to remove {} after copy: {e}", src.display())
            })?;
            Ok(())
        }
    }
}

pub fn migrate_data_root(old_root: &str, new_root: &str) -> Result<(), String> {
    let old_path = PathBuf::from(expand_path(old_root));
    let new_path = PathBuf::from(expand_path(new_root));

    if old_path == new_path {
        return Ok(());
    }

    if !old_path.exists() {
        fs::create_dir_all(&new_path)
            .map_err(|e| format!("failed to create {}: {e}", new_path.display()))?;
        return Ok(());
    }

    stop_managed_containers()?;

    fs::create_dir_all(&new_path)
        .map_err(|e| format!("failed to create {}: {e}", new_path.display()))?;

    let entries = fs::read_dir(&old_path)
        .map_err(|e| format!("failed to read {}: {e}", old_path.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read data root entry: {e}"))?;
        let file_type = entry.file_type().map_err(|e| format!("failed to stat entry: {e}"))?;
        if !file_type.is_dir() {
            continue;
        }

        let service_id = entry.file_name().to_string_lossy().to_string();
        let old_data = entry.path().join("data");
        if !old_data.is_dir() {
            continue;
        }

        let new_data = new_path.join(&service_id).join("data");
        move_entry(&old_data, &new_data)?;
        println!("Migrated data for {service_id}");
    }

    Ok(())
}

pub fn paths_equal(a: &str, b: &str) -> bool {
    expand_path(a) == expand_path(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("clarklab-{name}-{nanos}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn expand_path_resolves_home_prefix() {
        if let Ok(home) = std::env::var("HOME") {
            assert_eq!(
                expand_path("~/clarklab/services"),
                format!("{home}/clarklab/services")
            );
        }
    }

    #[test]
    fn migrate_data_root_moves_service_directories() {
        let old_root = temp_dir("old");
        let new_root = temp_dir("new");
        let service_dir = old_root.join("env-123").join("data");
        fs::create_dir_all(&service_dir).unwrap();
        fs::write(service_dir.join("db.dat"), b"payload").unwrap();

        migrate_data_root(
            &old_root.to_string_lossy(),
            &new_root.to_string_lossy(),
        )
        .unwrap();

        let migrated = new_root.join("env-123").join("data").join("db.dat");
        assert!(migrated.exists());
        assert!(!service_dir.exists());
    }
}
