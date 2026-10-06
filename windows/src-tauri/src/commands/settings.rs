use super::{emit, invalid, AppState};
use crate::error::AppError;
use crate::store::panel_sizes;
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> Result<Value, AppError> {
    Ok(state.settings.lock().unwrap().get())
}

#[tauri::command]
pub async fn settings_set(
    app: AppHandle,
    state: State<'_, AppState>,
    partial: Value,
) -> Result<Value, AppError> {
    let v = state
        .settings
        .lock()
        .unwrap()
        .set(&partial)
        .map_err(invalid)?;
    if partial.get("onboardingCompleted") == Some(&Value::Bool(true)) {
        crate::logging::info("onboarding completed");
    }
    emit(&app, "settings://changed", v.clone());
    crate::hotkeys::on_settings_changed(&app, &v);
    crate::tray::on_settings_changed(&app, &v);
    Ok(v)
}

#[tauri::command]
pub async fn panel_size_get(
    state: State<'_, AppState>,
    pin_id: String,
    max_w: f64,
    max_h: f64,
) -> Result<Option<(f64, f64)>, AppError> {
    Ok(panel_sizes::get(
        &state.settings.lock().unwrap(),
        &pin_id,
        max_w,
        max_h,
    ))
}

#[tauri::command]
pub async fn panel_size_set(
    app: AppHandle,
    state: State<'_, AppState>,
    pin_id: String,
    w: f64,
    h: f64,
    max_w: f64,
    max_h: f64,
) -> Result<(f64, f64), AppError> {
    let mut s = state.settings.lock().unwrap();
    let r = panel_sizes::set(&mut s, &pin_id, w, h, max_w, max_h);
    emit(&app, "settings://changed", s.get());
    Ok(r)
}

#[tauri::command]
pub async fn panel_size_reset(
    app: AppHandle,
    state: State<'_, AppState>,
    pin_id: String,
) -> Result<(), AppError> {
    let mut s = state.settings.lock().unwrap();
    panel_sizes::reset(&mut s, &pin_id);
    emit(&app, "settings://changed", s.get());
    Ok(())
}
