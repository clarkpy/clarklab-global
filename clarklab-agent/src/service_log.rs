use serde::Serialize;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_TASK_LOG_LINES: usize = 200;
const MAX_LINE_LEN: usize = 800;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLogEntry {
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recorded_at_ms: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceLogLine {
    pub service_id: String,
    pub level: String,
    pub message: String,
}

pub struct TaskLogger {
    entries: Vec<TaskLogEntry>,
}

impl TaskLogger {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    pub fn info(&mut self, message: impl Into<String>) {
        self.push_line("info", message.into());
    }

    pub fn warn(&mut self, message: impl Into<String>) {
        self.push_line("warn", message.into());
    }

    pub fn error(&mut self, message: impl Into<String>) {
        self.push_line("error", message.into());
    }

    pub fn output(&mut self, label: &str, text: &str) {
        if text.trim().is_empty() {
            return;
        }
        self.info(format!("{label}:"));
        for line in text.lines().take(120) {
            let trimmed = line.trim_end();
            if !trimmed.is_empty() {
                self.push_line("info", trimmed.to_string());
            }
        }
    }

    fn push_line(&mut self, level: &str, message: String) {
        if self.entries.len() >= MAX_TASK_LOG_LINES {
            return;
        }
        let message = if message.len() > MAX_LINE_LEN {
            format!("{}…", &message[..MAX_LINE_LEN])
        } else {
            message
        };
        self.entries.push(TaskLogEntry {
            level: level.to_string(),
            message,
            recorded_at_ms: Some(unix_now_ms()),
        });
    }

    pub fn into_entries(self) -> Vec<TaskLogEntry> {
        self.entries
    }

    pub fn drain(&mut self) -> Vec<TaskLogEntry> {
        std::mem::take(&mut self.entries)
    }
}

impl Default for TaskLogger {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Default)]
pub struct ContainerLogCursors {
    since_unix_by_container: HashMap<String, i64>,
}

impl ContainerLogCursors {
    pub fn mark_fetched(&mut self, container_name: &str) {
        let now = unix_now();
        self.since_unix_by_container
            .insert(container_name.to_string(), now);
    }

    pub fn since_unix(&self, container_name: &str) -> i64 {
        self.since_unix_by_container
            .get(container_name)
            .copied()
            .unwrap_or(0)
    }
}

pub fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

pub fn unix_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub fn classify_container_log_line(line: &str) -> (&'static str, String) {
    let lower = line.to_lowercase();
    let level = if lower.contains(" error")
        || lower.contains("error:")
        || lower.contains("fatal")
        || lower.contains("exception")
        || lower.contains("failed")
    {
        "error"
    } else if lower.contains(" warn") || lower.contains("warning") {
        "warn"
    } else {
        "info"
    };
    (level, trim_log_line(line))
}

fn trim_log_line(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.len() <= MAX_LINE_LEN {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..MAX_LINE_LEN])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_logger_caps_lines() {
        let mut logger = TaskLogger::new();
        for index in 0..MAX_TASK_LOG_LINES + 10 {
            logger.info(format!("line {index}"));
        }
        assert_eq!(logger.into_entries().len(), MAX_TASK_LOG_LINES);
    }

    #[test]
    fn classifies_error_lines() {
        let (level, _) = classify_container_log_line("2024-01-01 ERROR: something broke");
        assert_eq!(level, "error");
    }

    #[test]
    fn task_log_entries_include_timestamps() {
        let mut logger = TaskLogger::new();
        logger.info("hello");
        let entry = logger.into_entries().pop().expect("entry");
        assert!(entry.recorded_at_ms.is_some());
    }
}
