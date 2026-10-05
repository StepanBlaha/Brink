//! Reminder commands: the TypeScript planner decides, Rust stores and delivers (plan 3.f).

use super::AppState;
use crate::error::AppError;
use crate::notify::{delivery, NotifyRequest, NotifyState};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Manages the notify state; call after `commands::setup`.
pub fn setup(app: &AppHandle) {
    let path = app.state::<AppState>().paths.cache.join("notify.json");
    app.manage(NotifyState::open(path, delivery::platform()));
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyStatus {
    /// `enabled` or the Windows `NotificationSetting` reason.
    pub permission: String,
}

#[tauri::command]
pub async fn notify_status(state: State<'_, NotifyState>) -> Result<NotifyStatus, AppError> {
    Ok(NotifyStatus {
        permission: state.permission(),
    })
}

/// Requests that have not fired yet (item reminders, summaries and snoozes).
#[tauri::command]
pub async fn notify_pending(state: State<'_, NotifyState>) -> Result<Vec<NotifyRequest>, AppError> {
    Ok(state.pending(now_ms()))
}

/// Removes `remove` and (re)schedules the changed requests in `add`.
#[tauri::command]
pub async fn notify_apply(
    state: State<'_, NotifyState>,
    add: Vec<NotifyRequest>,
    remove: Vec<String>,
) -> Result<usize, AppError> {
    Ok(state.apply(&add, &remove, now_ms()))
}
