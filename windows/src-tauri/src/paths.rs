//! Storage locations (plan D8): `%APPDATA%\Brink` for small state,
//! `%LOCALAPPDATA%\Brink` for cache and logs, a temp root for demo mode.
//! Resolution takes an env getter so tests can override variables.

use std::path::PathBuf;

pub const APP_DIR: &str = "Brink";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paths {
    pub data: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
}

fn pick(get: &dyn Fn(&str) -> Option<String>, key: &str, fallback: &[&str]) -> PathBuf {
    if let Some(v) = get(key).filter(|v| !v.is_empty()) {
        return PathBuf::from(v);
    }
    // Non-Windows dev fallback: ~/<fallback...>
    let home = get("HOME")
        .or_else(|| get("USERPROFILE"))
        .unwrap_or_else(|| ".".to_string());
    let mut p = PathBuf::from(home);
    p.extend(fallback);
    p
}

/// `BRINK_DATA_DIR` / `BRINK_LOCAL_DIR` override everything (tests, portable).
pub fn resolve_with(get: &dyn Fn(&str) -> Option<String>) -> Paths {
    let data = match get("BRINK_DATA_DIR").filter(|v| !v.is_empty()) {
        Some(v) => PathBuf::from(v),
        None => pick(get, "APPDATA", &[".config"]).join(APP_DIR),
    };
    let local = match get("BRINK_LOCAL_DIR").filter(|v| !v.is_empty()) {
        Some(v) => PathBuf::from(v),
        None => pick(get, "LOCALAPPDATA", &[".local", "share"]).join(APP_DIR),
    };
    Paths {
        data,
        cache: local.join("cache"),
        logs: local.join("logs"),
    }
}

/// Demo mode layout under `root`: nothing of it touches `%APPDATA%` or `%LOCALAPPDATA%`.
pub fn demo_paths(root: &std::path::Path) -> Paths {
    Paths {
        data: root.join("data"),
        cache: root.join("cache"),
        logs: root.join("logs"),
    }
}

/// Real folders, or the temp root while demo mode is active.
pub fn resolve() -> Paths {
    if crate::demo::is_active() {
        return demo_paths(&demo_root());
    }
    resolve_with(&|k| std::env::var(k).ok())
}

/// Demo mode root: `%TEMP%\BrinkDemo-<pid>`.
pub fn demo_root_with(get: &dyn Fn(&str) -> Option<String>, pid: u32) -> PathBuf {
    let tmp = get("TEMP")
        .or_else(|| get("TMPDIR"))
        .unwrap_or_else(|| "/tmp".to_string());
    PathBuf::from(tmp).join(format!("BrinkDemo-{pid}"))
}

pub fn demo_root() -> PathBuf {
    demo_root_with(&|k| std::env::var(k).ok(), std::process::id())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let m: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |k| m.get(k).cloned()
    }

    #[test]
    fn resolves_appdata_and_localappdata() {
        let p = resolve_with(&env(&[
            ("APPDATA", "/r/Roaming"),
            ("LOCALAPPDATA", "/r/Local"),
        ]));
        assert_eq!(p.data, PathBuf::from("/r/Roaming/Brink"));
        assert_eq!(p.cache, PathBuf::from("/r/Local/Brink/cache"));
        assert_eq!(p.logs, PathBuf::from("/r/Local/Brink/logs"));
    }

    #[test]
    fn brink_overrides_win() {
        let p = resolve_with(&env(&[
            ("APPDATA", "/r/Roaming"),
            ("BRINK_DATA_DIR", "/x/data"),
            ("BRINK_LOCAL_DIR", "/x/local"),
        ]));
        assert_eq!(p.data, PathBuf::from("/x/data"));
        assert_eq!(p.cache, PathBuf::from("/x/local/cache"));
    }

    #[test]
    fn falls_back_to_home() {
        let p = resolve_with(&env(&[("HOME", "/home/u")]));
        assert_eq!(p.data, PathBuf::from("/home/u/.config/Brink"));
        assert_eq!(p.logs, PathBuf::from("/home/u/.local/share/Brink/logs"));
    }

    #[test]
    fn demo_paths_stay_under_the_root() {
        let p = demo_paths(std::path::Path::new("/t/BrinkDemo-7"));
        assert_eq!(p.data, PathBuf::from("/t/BrinkDemo-7/data"));
        assert!(p.cache.starts_with("/t/BrinkDemo-7") && p.logs.starts_with("/t/BrinkDemo-7"));
    }

    #[test]
    fn demo_root_uses_pid() {
        let r = demo_root_with(&env(&[("TEMP", "/t")]), 42);
        assert_eq!(r, PathBuf::from("/t/BrinkDemo-42"));
    }
}
