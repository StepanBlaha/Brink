//! File logging under `%LOCALAPPDATA%\Brink\logs\brink.log`: rolling, 1 MB x 3.
//! Never log the Notion token: every line is redacted before it is written.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub const MAX_BYTES: u64 = 1024 * 1024;
pub const KEEP: usize = 3;

pub struct Logger {
    path: PathBuf,
    max_bytes: u64,
    lock: Mutex<()>,
}

/// Masks Notion tokens (`secret_…`, `ntn_…`) and `Bearer <x>` values.
pub fn redact(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while !rest.is_empty() {
        let hit = ["secret_", "ntn_", "Bearer "]
            .iter()
            .filter_map(|p| rest.find(p).map(|i| (i, *p)))
            .min_by_key(|(i, _)| *i);
        let Some((i, p)) = hit else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..i]);
        out.push_str("[redacted]");
        let tail = &rest[i + p.len()..];
        let n = tail
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.'))
            .unwrap_or(tail.len());
        rest = &tail[n..];
    }
    out
}

impl Logger {
    pub fn new(dir: &Path) -> Self {
        Self::with_limit(dir, MAX_BYTES)
    }

    pub fn with_limit(dir: &Path, max_bytes: u64) -> Self {
        let _ = fs::create_dir_all(dir);
        Self {
            path: dir.join("brink.log"),
            max_bytes,
            lock: Mutex::new(()),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn rotated(&self, n: usize) -> PathBuf {
        let mut s = self.path.clone().into_os_string();
        s.push(format!(".{n}"));
        PathBuf::from(s)
    }

    fn rotate(&self) {
        let _ = fs::remove_file(self.rotated(KEEP - 1));
        for n in (1..KEEP - 1).rev() {
            let _ = fs::rename(self.rotated(n), self.rotated(n + 1));
        }
        let _ = fs::rename(&self.path, self.rotated(1));
    }

    pub fn log(&self, level: &str, msg: &str) {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        if fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0) >= self.max_bytes {
            self.rotate();
        }
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let line = format!("{secs} {level} {}\n", redact(msg).replace('\n', " "));
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = f.write_all(line.as_bytes());
        }
    }

    pub fn info(&self, msg: &str) {
        self.log("INFO", msg);
    }

    pub fn error(&self, msg: &str) {
        self.log("ERROR", msg);
    }
}

static GLOBAL: OnceLock<Logger> = OnceLock::new();

pub fn init() {
    let _ = GLOBAL.set(Logger::new(&crate::paths::resolve().logs));
}

pub fn global() -> Option<&'static Logger> {
    GLOBAL.get()
}

pub fn info(msg: &str) {
    if let Some(l) = global() {
        l.info(msg);
    }
}

pub fn error(msg: &str) {
    if let Some(l) = global() {
        l.error(msg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_tokens_and_bearer() {
        let r = redact("hdr Bearer secret_abcDEF123 and ntn_xyz987 end");
        assert!(!r.contains("abcDEF123"));
        assert!(!r.contains("xyz987"));
        assert!(r.contains("end"));
    }

    #[test]
    fn writes_and_rotates() {
        let d = tempfile::tempdir().unwrap();
        let l = Logger::with_limit(d.path(), 200);
        for i in 0..40 {
            l.info(&format!("line {i} secret_TOKENVALUE"));
        }
        let main = fs::read_to_string(l.path()).unwrap();
        assert!(!main.contains("TOKENVALUE"));
        assert!(main.contains("[redacted]"));
        assert!(d.path().join("brink.log.1").exists());
        assert!(d.path().join("brink.log.2").exists());
        assert!(!d.path().join("brink.log.3").exists());
    }
}
