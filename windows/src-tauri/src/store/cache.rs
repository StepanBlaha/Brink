//! Per-pin JSON cache (port of Cache.swift): `<cache>/<pinId>-<kind>.json`.
//! Content is passed through as JSON text; blocks are cached as the raw API objects (plan 9.1).

use super::atomic::write_atomic;
use std::fs;
use std::path::{Path, PathBuf};

pub struct Cache {
    dir: PathBuf,
}

/// Ids and kinds become file names: reject anything that could escape the directory.
fn safe(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

impl Cache {
    pub fn new(dir: &Path) -> Self {
        Self {
            dir: dir.to_path_buf(),
        }
    }

    fn file(&self, pin_id: &str, kind: &str) -> Result<PathBuf, String> {
        if !safe(pin_id) || !safe(kind) {
            return Err("Invalid cache key".into());
        }
        Ok(self.dir.join(format!("{pin_id}-{kind}.json")))
    }

    pub fn save(&self, pin_id: &str, kind: &str, json: &str) -> Result<(), String> {
        serde_json::from_str::<serde_json::Value>(json).map_err(|e| e.to_string())?;
        write_atomic(&self.file(pin_id, kind)?, json.as_bytes()).map_err(|e| e.to_string())
    }

    /// `None` when absent or unreadable.
    pub fn load(&self, pin_id: &str, kind: &str) -> Result<Option<String>, String> {
        Ok(fs::read_to_string(self.file(pin_id, kind)?).ok())
    }

    pub fn clear(&self, pin_id: &str, kind: &str) -> Result<(), String> {
        let _ = fs::remove_file(self.file(pin_id, kind)?);
        Ok(())
    }
}
