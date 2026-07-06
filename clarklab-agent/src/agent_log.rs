use serde::Serialize;

const MAX_AGENT_LOG_LINES: usize = 500;
const MAX_LINE_LEN: usize = 800;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLogLine {
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recorded_at_ms: Option<i64>,
}

pub struct AgentLogBuffer {
    entries: Vec<AgentLogLine>,
}

impl AgentLogBuffer {
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

    pub fn ingest_task_logs(&mut self, entries: &[crate::service_log::TaskLogEntry]) {
        for entry in entries {
            match entry.level.as_str() {
                "error" => self.error(entry.message.clone()),
                "warn" => self.warn(entry.message.clone()),
                _ => self.info(entry.message.clone()),
            }
        }
    }

    fn push_line(&mut self, level: &str, message: String) {
        let message = truncate_line(&message);
        if self.entries.len() >= MAX_AGENT_LOG_LINES {
            self.entries.remove(0);
        }
        self.entries.push(AgentLogLine {
            level: level.to_string(),
            message,
            source_id: None,
            recorded_at_ms: None,
        });
    }

    pub fn drain(&mut self) -> Vec<AgentLogLine> {
        std::mem::take(&mut self.entries)
    }
}

fn truncate_line(message: &str) -> String {
    let mut characters = message.chars();
    let truncated = characters.by_ref().take(MAX_LINE_LEN).collect::<String>();
    if characters.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

impl Default for AgentLogBuffer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_log_buffer_keeps_most_recent_lines() {
        let mut buffer = AgentLogBuffer::new();
        for index in 0..MAX_AGENT_LOG_LINES + 10 {
            buffer.info(format!("line {index}"));
        }
        let drained = buffer.drain();
        assert_eq!(drained.len(), MAX_AGENT_LOG_LINES);
        assert_eq!(drained[0].message, "line 10");
        assert_eq!(
            drained.last().unwrap().message,
            format!("line {}", MAX_AGENT_LOG_LINES + 9)
        );
    }
}
