//! Tauri commands (plan 2.3). Logic lives on `AppState`; command fns are thin wrappers.

pub mod auth;
pub mod cache;
pub mod notify;
pub mod notion_cmds;
pub mod pins;
pub mod queue;
pub mod settings;
pub mod state;
pub mod windows;

pub use state::AppState;

use crate::error::AppError;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub fn invalid(msg: impl Into<String>) -> AppError {
    AppError::new("invalid", msg)
}

pub fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        crate::logging::error(&format!("emit {event} failed: {e}"));
    }
}

/// Builds the app state, manages it and wires the queue's change events.
pub fn setup(app: &AppHandle) {
    let state = AppState::production();
    let handle = app.clone();
    state.queue.set_listener(std::sync::Arc::new(move |st| {
        emit(&handle, "queue://changed", st)
    }));
    app.manage(state);
}
