use crate::agent_log::AgentLogLine;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

const MAX_JOURNAL_LINES: usize = 500;
const MAX_MESSAGE_CHARS: usize = 800;

#[derive(Default)]
pub struct JournalBatch {
    pub entries: Vec<AgentLogLine>,
    pub next_cursor: Option<String>,
}

pub struct JournalCollector {
    unit: String,
    cursor_path: PathBuf,
    cursor: Option<String>,
}

impl JournalCollector {
    pub fn new(unit: impl Into<String>, cursor_path: PathBuf) -> Self {
        let cursor = fs::read_to_string(&cursor_path)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        Self {
            unit: unit.into(),
            cursor_path,
            cursor,
        }
    }

    pub fn collect(&self) -> Result<JournalBatch, String> {
        let mut command = Command::new("journalctl");
        command.args([
            "--unit",
            &self.unit,
            "--output=json",
            "--no-pager",
            "--quiet",
        ]);

        if let Some(cursor) = self.cursor.as_deref() {
            command.arg(format!("--after-cursor={cursor}"));
        }

        let mut child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| format!("failed to start journalctl: {err}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "journalctl stdout was busy".to_string())?;

        let mut batch = JournalBatch::default();
        let mut lines_read = 0;

        for line in BufReader::new(stdout).lines().take(MAX_JOURNAL_LINES) {
            let line = line.map_err(|err| format!("failed to read journal output: {err}"))?;
            lines_read += 1;

            if let Some(entry) = parse_journal_entry(&line) {
                batch.next_cursor = entry.source_id.clone();
                batch.entries.push(entry);
            }
        }

        let reached_limit = lines_read >= MAX_JOURNAL_LINES;
        if reached_limit {
            let _ = child.kill();
        }

        let status = child
            .wait()
            .map_err(|err| format!("failed to wait for journalctl: {err}"))?;

        if !status.success() && !reached_limit {
            return Err(format!("journalctl exited with status {status}"));
        }

        Ok(batch)
    }

    pub fn commit(&mut self, source_id: &str) -> Result<(), String> {
        let cursor = source_id
            .strip_prefix("journal:")
            .unwrap_or(source_id)
            .trim();

        if cursor.is_empty() {
            return Ok(());
        }

        let temporary = self.cursor_path.with_extension("cursor.tmp");

        fs::write(&temporary, cursor)
            .map_err(|err| format!("failed to write cursor file: {err}"))?;

        fs::rename(&temporary, &self.cursor_path)
            .map_err(|err| format!("failed to rename cursor file: {err}"))?;

        self.cursor = Some(cursor.to_string());
        Ok(())
    }
}

fn parse_journal_entry(line: &str) -> Option<AgentLogLine> {
    let value: Value = serde_json::from_str(line).ok()?;
    let cursor = value.get("__CURSOR")?.as_str()?.trim();
    let message = journal_message(value.get("MESSAGE")?)?;

    if cursor.is_empty() || message.trim().is_empty() {
        return None;
    }

    let priority = value
        .get("PRIORITY")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<u8>().ok())
        .unwrap_or(6);

    let level = match priority {
        0..=3 => "error",
        4 => "warn",
        _ => "info",
    };

    let recorded_at_ms = value
        .get("__REALTIME_TIMESTAMP")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<u64>().ok())
        .map(|microseconds| (microseconds / 1_000) as i64);

    Some(AgentLogLine {
        level: level.to_string(),
        message: truncate_message(message.trim()),
        source_id: Some(format!("journal:{cursor}")),
        recorded_at_ms,
    })
}

fn journal_message(value: &Value) -> Option<String> {
    if let Some(message) = value.as_str() {
        return Some(message.to_string());
    }

    let bytes = value
        .as_array()?
        .iter()
        .filter_map(Value::as_u64)
        .filter_map(|value| u8::try_from(value).ok())
        .collect::<Vec<_>>();

    Some(String::from_utf8_lossy(&bytes).to_string())
}

fn truncate_message(message: &str) -> String {
    let mut characters = message.chars();

    let truncated = characters
        .by_ref()
        .take(MAX_MESSAGE_CHARS)
        .collect::<String>();

    if characters.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_journal_metadata() {
        let entry = parse_journal_entry(
            r#"{"__CURSOR":"cursor-1","MESSAGE":"agent failed","PRIORITY":"3","__REALTIME_TIMESTAMP":"1720000000123456"}"#,
        )
        .expect("journal entry");

        assert_eq!(entry.level, "error");
        assert_eq!(entry.message, "agent failed");
        assert_eq!(entry.source_id.as_deref(), Some("journal:cursor-1"));
        assert_eq!(entry.recorded_at_ms, Some(1_720_000_000_123));
    }

    #[test]
    fn ignores_entries_without_messages() {
        assert!(parse_journal_entry(r#"{"__CURSOR":"cursor-1"}"#).is_none());
    }

    #[test]
    fn truncates_unicode_without_panicking() {
        let message = "🦀".repeat(MAX_MESSAGE_CHARS + 1);
        let truncated = truncate_message(&message);
        assert_eq!(truncated.chars().count(), MAX_MESSAGE_CHARS + 1);
        assert!(truncated.ends_with('…'));
    }
}
