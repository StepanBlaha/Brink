//! Demo mode detection. Pure: arguments, an env getter and a trigger file path go in, an
//! optional `DemoConfig` comes out. Sources by priority: `--demo` flags, `BRINK_DEMO*` env,
//! then the trigger file `%APPDATA%\Brink\demo-mode.json` (`{"script": "full"}`).

use serde::Deserialize;
use std::path::{Path, PathBuf};

pub const DEFAULT_SCRIPT: &str = "full";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DemoConfig {
    /// `full`, `screens`, `probe` or `none` (no director, states driven by hand).
    pub script: String,
    /// Folder the director drops `shot-<name>` marker files into for the capture script.
    pub marker_dir: Option<PathBuf>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TriggerFile {
    script: Option<String>,
    marker_directory: Option<String>,
}

/// `%APPDATA%\Brink\demo-mode.json` (the Mac `demo-mode.json` trigger file).
pub fn trigger_file_with(get: &dyn Fn(&str) -> Option<String>) -> PathBuf {
    crate::paths::resolve_with(get).data.join("demo-mode.json")
}

fn truthy(v: &str) -> bool {
    matches!(
        v.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn flag_value(args: &[String], name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if let Some(v) = a.strip_prefix(&prefix) {
            return Some(v.to_string());
        }
        if a == name {
            return it.next().filter(|n| !n.starts_with("--")).cloned();
        }
    }
    None
}

fn read_trigger(file: &Path) -> Option<TriggerFile> {
    let bytes = std::fs::read(file).ok()?;
    Some(serde_json::from_slice(&bytes).unwrap_or_default())
}

fn non_empty(v: Option<String>) -> Option<String> {
    v.filter(|s| !s.trim().is_empty())
}

pub fn detect_with(
    args: &[String],
    get: &dyn Fn(&str) -> Option<String>,
    trigger: &Path,
) -> Option<DemoConfig> {
    let by_arg = args.iter().any(|a| a == "--demo");
    let by_env = get("BRINK_DEMO").is_some_and(|v| truthy(&v));
    let file = read_trigger(trigger);
    if !by_arg && !by_env && file.is_none() {
        return None;
    }
    let file = file.unwrap_or_default();
    let script = non_empty(flag_value(args, "--demo-script"))
        .or_else(|| non_empty(get("BRINK_DEMO_SCRIPT")))
        .or_else(|| non_empty(file.script))
        .unwrap_or_else(|| DEFAULT_SCRIPT.to_string());
    let marker_dir = non_empty(flag_value(args, "--demo-markers"))
        .or_else(|| non_empty(get("BRINK_DEMO_MARKERS")))
        .or_else(|| non_empty(file.marker_directory))
        .map(PathBuf::from);
    Some(DemoConfig { script, marker_dir })
}

/// Real process: `std::env::args`, the environment and the real trigger file.
pub fn detect() -> Option<DemoConfig> {
    let get = |k: &str| std::env::var(k).ok();
    let args: Vec<String> = std::env::args().skip(1).collect();
    detect_with(&args, &get, &trigger_file_with(&get))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn none(_: &str) -> Option<String> {
        None
    }
    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }
    fn missing() -> PathBuf {
        PathBuf::from("/definitely/not/here/demo-mode.json")
    }

    #[test]
    fn off_without_any_trigger() {
        assert_eq!(
            detect_with(&args(&["--autostart"]), &none, &missing()),
            None
        );
        let off = |k: &str| (k == "BRINK_DEMO").then(|| "0".to_string());
        assert_eq!(detect_with(&[], &off, &missing()), None);
    }

    #[test]
    fn flag_turns_it_on_with_default_script() {
        let c = detect_with(&args(&["--demo"]), &none, &missing()).unwrap();
        assert_eq!(c.script, "full");
        assert_eq!(c.marker_dir, None);
    }

    #[test]
    fn env_turns_it_on() {
        let get = |k: &str| match k {
            "BRINK_DEMO" => Some("1".to_string()),
            "BRINK_DEMO_SCRIPT" => Some("screens".to_string()),
            _ => None,
        };
        assert_eq!(
            detect_with(&[], &get, &missing()).unwrap().script,
            "screens"
        );
    }

    #[test]
    fn flag_values_support_both_spellings() {
        let a = args(&["--demo", "--demo-script", "none", "--demo-markers=C:\\m"]);
        let c = detect_with(&a, &none, &missing()).unwrap();
        assert_eq!(c.script, "none");
        assert_eq!(c.marker_dir, Some(PathBuf::from("C:\\m")));
    }

    #[test]
    fn trigger_file_turns_it_on_and_args_win() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("demo-mode.json");
        std::fs::write(&f, r#"{"script":"probe","markerDirectory":"/m"}"#).unwrap();
        let c = detect_with(&[], &none, &f).unwrap();
        assert_eq!(
            (c.script.as_str(), c.marker_dir),
            ("probe", Some("/m".into()))
        );
        let c = detect_with(&args(&["--demo-script=full"]), &none, &f).unwrap();
        assert_eq!(c.script, "full");
    }

    #[test]
    fn broken_trigger_file_still_means_demo() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("demo-mode.json");
        std::fs::write(&f, "not json").unwrap();
        assert_eq!(detect_with(&[], &none, &f).unwrap().script, "full");
    }

    #[test]
    fn trigger_file_lives_in_the_data_dir() {
        let get = |k: &str| (k == "APPDATA").then(|| "/r/Roaming".to_string());
        assert_eq!(
            trigger_file_with(&get),
            PathBuf::from("/r/Roaming/Brink/demo-mode.json")
        );
    }
}
