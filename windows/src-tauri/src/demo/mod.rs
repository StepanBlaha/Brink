//! Demo mode (plan 6.3, M9): a scripted marketing and screenshot mode. It talks to an
//! in-process fake Notion on `127.0.0.1:0`, keeps everything in `%TEMP%\BrinkDemo-<pid>`,
//! holds a fake token in memory (never the Credential Manager), and pins the demo's look.
//! Enabled by `--demo`, `BRINK_DEMO=1` or `%APPDATA%\Brink\demo-mode.json`.

pub mod backdrop;
pub mod blocks;
pub mod content;
pub mod detect;
pub mod handlers;
pub mod markers;
pub mod server;
pub mod store;
pub mod uploads;

use crate::commands::AppState;
use crate::error::AppError;
use crate::store::pins::Pin;
use serde::Serialize;
use std::path::Path;
use std::sync::OnceLock;

pub use detect::DemoConfig;

/// Never a real credential; the fake server accepts any token.
pub const FAKE_TOKEN: &str = "demo_fake_token_not_real";

static CONFIG: OnceLock<Option<DemoConfig>> = OnceLock::new();
static SERVER: OnceLock<server::Server> = OnceLock::new();

/// Detects demo mode once. Call first thing at launch, before logging or any store exists.
pub fn init() {
    CONFIG.get_or_init(detect::detect);
}

pub fn config() -> Option<&'static DemoConfig> {
    CONFIG.get().and_then(Option::as_ref)
}

pub fn is_active() -> bool {
    config().is_some()
}

pub fn base_url() -> Option<String> {
    SERVER.get().map(server::Server::base_url)
}

/// Builds the app state over `root`: temp storage, in-memory fake token, `base_url` as the
/// Notion API, demo pins and demo settings. Never reads or writes the real data folders.
pub fn state_in(root: &Path, base_url: String) -> AppState {
    let paths = crate::paths::demo_paths(root);
    let _ = std::fs::create_dir_all(&paths.data);
    let state = AppState::new(
        paths,
        crate::secrets::demo_backend(FAKE_TOKEN),
        Some(base_url),
    );
    {
        let mut pins = state.pins.lock().unwrap_or_else(|e| e.into_inner());
        if pins.pins().is_empty() {
            for json in content::pins() {
                if let Ok(pin) = serde_json::from_value::<Pin>(json) {
                    pins.add(pin);
                }
            }
        }
    }
    let _ = state
        .settings
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .set(&content::settings());
    state
}

/// The state for a demo run: starts the fake server, then `state_in` the temp root.
pub fn build_state() -> AppState {
    let server = match server::start() {
        Ok(s) => s,
        Err(e) => {
            crate::logging::error(&format!("demo server failed: {e}"));
            std::process::exit(1);
        }
    };
    let url = server.base_url();
    let _ = SERVER.set(server);
    state_in(&crate::paths::demo_root(), url)
}

/// Removes the temp root (called on exit).
pub fn cleanup() {
    if is_active() {
        let _ = std::fs::remove_dir_all(crate::paths::demo_root());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoState {
    pub enabled: bool,
    pub base_url: Option<String>,
    pub script: Option<String>,
    /// A marker folder is set, so the director should handshake with the capture script.
    pub markers: bool,
}

pub fn demo_state_now() -> DemoState {
    DemoState {
        enabled: is_active(),
        base_url: base_url(),
        script: config().map(|c| c.script.clone()),
        markers: config().is_some_and(|c| c.marker_dir.is_some()),
    }
}

#[tauri::command]
pub async fn demo_state() -> Result<DemoState, AppError> {
    Ok(demo_state_now())
}

/// The director is done: quit the demo (the temp folder goes with it).
#[tauri::command]
pub async fn demo_finish(app: tauri::AppHandle) -> Result<(), AppError> {
    if is_active() {
        app.exit(0);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inactive_by_default_in_tests() {
        assert!(!is_active());
        assert!(!demo_state_now().enabled);
        assert_eq!(base_url(), None);
    }

    #[test]
    fn state_in_stays_inside_the_root_and_seeds() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("BrinkDemo-1");
        let state = state_in(&root, "http://127.0.0.1:9/v1".into());
        for p in [&state.paths.data, &state.paths.cache, &state.paths.logs] {
            assert!(p.starts_with(&root), "{p:?} escapes {root:?}");
        }
        assert_eq!(state.tokens.load().as_deref(), Some(FAKE_TOKEN));
        let pins = state.pins.lock().unwrap();
        let titles: Vec<_> = pins.pins().iter().map(|p| p.title.as_str()).collect();
        assert_eq!(titles, ["Groceries", "Launch plan", "Sprint", "Reading"]);
        let s = state.settings.lock().unwrap().get();
        assert_eq!(
            (s["dockEdge"].as_str(), s["pillStyle"].as_str()),
            (Some("right"), Some("line"))
        );
        assert_eq!(s["soundsEnabled"], false);
        assert!(root.join("data").join("pins.json").exists());
    }
}
