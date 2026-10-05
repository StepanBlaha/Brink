//! Handshake with `scripts/record-demo.ps1` through marker files (Mac `DemoMode.mark`).
//! `demo_mark("peek")` writes `shot-peek`; the script takes a still and writes `shot-peek-done`;
//! `demo_wait("peek-done", 3000)` waits for it. `shot-go` starts the director, `shot-done` ends it.

use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// `<dir>/shot-<name>`; names are limited to letters, digits, `-` and `_`.
pub fn marker_path(dir: &Path, name: &str) -> Option<PathBuf> {
    let ok = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    ok.then(|| dir.join(format!("shot-{name}")))
}

pub async fn wait_for(path: &Path, timeout: Duration) -> bool {
    let end = Instant::now() + timeout;
    while !path.exists() {
        if Instant::now() >= end {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    true
}

fn path_for(name: &str) -> Option<PathBuf> {
    marker_path(super::config()?.marker_dir.as_deref()?, name)
}

#[tauri::command]
pub async fn demo_mark(name: String) -> Result<(), AppError> {
    if let Some(p) = path_for(&name) {
        let _ = std::fs::create_dir_all(p.parent().unwrap_or(Path::new(".")));
        let _ = std::fs::write(p, b"");
    }
    Ok(())
}

/// True when the marker appeared; false on timeout or without a marker folder.
#[tauri::command]
pub async fn demo_wait(name: String, timeout_ms: u64) -> Result<bool, AppError> {
    match path_for(&name) {
        Some(p) => Ok(wait_for(&p, Duration::from_millis(timeout_ms.min(120_000))).await),
        None => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marker_names_are_sanitized() {
        let d = Path::new("/m");
        assert_eq!(
            marker_path(d, "1-peek"),
            Some(PathBuf::from("/m/shot-1-peek"))
        );
        assert_eq!(marker_path(d, "../x"), None);
        assert_eq!(marker_path(d, ""), None);
    }

    #[tokio::test]
    async fn wait_sees_a_file_created_later() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("shot-go");
        assert!(!wait_for(&p, Duration::from_millis(80)).await);
        let q = p.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(60)).await;
            std::fs::write(q, b"").unwrap();
        });
        assert!(wait_for(&p, Duration::from_secs(2)).await);
    }
}
