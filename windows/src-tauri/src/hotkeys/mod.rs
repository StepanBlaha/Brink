//! Global hotkeys via tauri-plugin-global-shortcut (plan 3.g, contract 2.3).
//! Commands: `hotkeys_apply`, `hotkeys_suspend`, `hotkeys_status`.
//! Events: `hotkey://fired {action, index?}`, `hotkey://failed {action, accelerator}`.

pub mod accel;
pub mod plan;

use crate::commands::{emit, AppState};
use crate::error::AppError;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyResult {
    pub action: String,
    pub accelerator: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Default)]
struct Inner {
    bindings: BTreeMap<String, String>,
    suspended: bool,
    results: Vec<HotkeyResult>,
}

#[derive(Default)]
pub struct HotkeyState(Mutex<Inner>);

#[derive(Serialize, Clone)]
struct Fired {
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    index: Option<usize>,
}

#[derive(Serialize, Clone)]
struct Failed {
    action: String,
    accelerator: String,
}

fn dispatch(app: &AppHandle, action: &str, index: Option<usize>) {
    if action == "quickCapture" {
        crate::capture::show(app);
    } else {
        emit(
            app,
            "hotkey://fired",
            Fired {
                action: action.to_string(),
                index,
            },
        );
    }
}

fn register_all(app: &AppHandle, bindings: &BTreeMap<String, String>) -> Vec<HotkeyResult> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut results = Vec::new();
    for p in plan::plan(bindings) {
        let stored = bindings.get(&p.action).cloned().unwrap_or_default();
        let entries = match p.entries {
            Ok(e) => e,
            Err(code) => {
                results.push(HotkeyResult {
                    action: p.action,
                    accelerator: stored,
                    ok: false,
                    error: Some(code.to_string()),
                });
                continue;
            }
        };
        let outcomes: Vec<(String, bool)> = entries
            .into_iter()
            .map(|(index, acc)| {
                let (a, handle) = (p.action.clone(), app.clone());
                let ok = gs
                    .on_shortcut(acc.as_str(), move |_, _, ev| {
                        if ev.state == ShortcutState::Pressed {
                            dispatch(&handle, &a, index);
                        }
                    })
                    .is_ok();
                (acc, ok)
            })
            .collect();
        let (ok, error, failing) = plan::aggregate(&outcomes);
        results.push(HotkeyResult {
            accelerator: failing.unwrap_or(stored),
            action: p.action,
            ok,
            error: error.map(str::to_string),
        });
    }
    results
}

fn apply(app: &AppHandle, bindings: BTreeMap<String, String>, announce: bool) -> Vec<HotkeyResult> {
    let state = app.state::<HotkeyState>();
    let mut inner = state.0.lock().unwrap_or_else(|e| e.into_inner());
    inner.bindings = bindings;
    if inner.suspended {
        inner.results.clear();
        return Vec::new();
    }
    let results = register_all(app, &inner.bindings);
    if announce {
        for r in results
            .iter()
            .filter(|r| r.error.as_deref() == Some("inUse"))
        {
            emit(
                app,
                "hotkey://failed",
                Failed {
                    action: r.action.clone(),
                    accelerator: r.accelerator.clone(),
                },
            );
        }
    }
    inner.results = results.clone();
    results
}

/// Bindings from a settings object (`hotkeys` map of strings).
pub fn bindings_of(settings: &Value) -> BTreeMap<String, String> {
    settings
        .get("hotkeys")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

/// Called after `settings_set`; re-applies only when the hotkeys changed.
pub fn on_settings_changed(app: &AppHandle, settings: &Value) {
    let b = bindings_of(settings);
    let same = app.state::<HotkeyState>().0.lock().unwrap().bindings == b;
    if !same {
        apply(app, b, true);
    }
}

#[tauri::command]
pub async fn hotkeys_apply(
    app: AppHandle,
    bindings: BTreeMap<String, String>,
) -> Result<Vec<HotkeyResult>, AppError> {
    Ok(apply(&app, bindings, true))
}

#[tauri::command]
pub async fn hotkeys_suspend(app: AppHandle, on: bool) -> Result<(), AppError> {
    let state = app.state::<HotkeyState>();
    let bindings = {
        let mut inner = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if inner.suspended == on {
            return Ok(());
        }
        inner.suspended = on;
        if on {
            let _ = app.global_shortcut().unregister_all();
            return Ok(());
        }
        inner.bindings.clone()
    };
    apply(&app, bindings, false);
    Ok(())
}

#[tauri::command]
pub async fn hotkeys_status(state: State<'_, HotkeyState>) -> Result<Vec<HotkeyResult>, AppError> {
    Ok(state.0.lock().unwrap().results.clone())
}

pub fn setup(app: &AppHandle) {
    app.manage(HotkeyState::default());
    let settings = app.state::<AppState>().settings.lock().unwrap().get();
    apply(app, bindings_of(&settings), true);
}
