//! Atomic JSON files: write `<file>.tmp`, then rename over the target. Corrupt files are
//! renamed to `<file>.corrupt-<unix>` and read as empty (Swift `try?` semantics).

use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = sibling(path, ".tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

pub fn write_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(io::Error::other)?;
    write_atomic(path, &bytes)
}

fn quarantine(path: &Path) {
    let unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = sibling(path, &format!(".corrupt-{unix}"));
    if fs::rename(path, &dest).is_ok() {
        crate::logging::error(&format!("corrupt file moved to {}", dest.display()));
    }
}

/// `None` when the file is missing or unreadable; undecodable files are quarantined.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let data = fs::read(path).ok()?;
    match serde_json::from_slice(&data) {
        Ok(v) => Some(v),
        Err(_) => {
            quarantine(path);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips_and_leaves_no_tmp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("sub").join("a.json");
        write_json(&p, &vec![1, 2, 3]).unwrap();
        assert_eq!(read_json::<Vec<i32>>(&p), Some(vec![1, 2, 3]));
        assert!(!sibling(&p, ".tmp").exists());
        write_json(&p, &vec![9]).unwrap();
        assert_eq!(read_json::<Vec<i32>>(&p), Some(vec![9]));
    }

    #[test]
    fn missing_is_none_and_corrupt_is_quarantined() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.json");
        assert_eq!(read_json::<Vec<i32>>(&p), None);
        fs::write(&p, b"{not json").unwrap();
        assert_eq!(read_json::<Vec<i32>>(&p), None);
        assert!(!p.exists());
        let n = fs::read_dir(d.path())
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains(".corrupt-")
            })
            .count();
        assert_eq!(n, 1);
    }
}
