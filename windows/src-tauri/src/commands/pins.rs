use super::{emit, AppState};
use crate::error::AppError;
use crate::store::pins::{Pin, PinGroup, PinStore};
use tauri::{AppHandle, State};

fn pins_changed(app: &AppHandle, s: &PinStore) {
    crate::logging::info(&format!("pins changed: count={}", s.pins().len()));
    emit(app, "pins://changed", s.pins().to_vec());
}

fn groups_changed(app: &AppHandle, s: &PinStore) {
    emit(app, "groups://changed", s.groups().to_vec());
}

#[tauri::command]
pub async fn pins_get(state: State<'_, AppState>) -> Result<Vec<Pin>, AppError> {
    Ok(state.pins.lock().unwrap().pins().to_vec())
}

#[tauri::command]
pub async fn pins_add(
    app: AppHandle,
    state: State<'_, AppState>,
    pin: Pin,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.add(pin);
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn pins_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.remove(&id);
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn pins_update(
    app: AppHandle,
    state: State<'_, AppState>,
    pin: Pin,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.update(pin);
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn pins_move_within_group(
    app: AppHandle,
    state: State<'_, AppState>,
    pin_id: String,
    to_index: i64,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.move_within_group(&pin_id, to_index, group_id.as_deref());
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn pins_move_among_all(
    app: AppHandle,
    state: State<'_, AppState>,
    pin_id: String,
    to_index: i64,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.move_among_all(&pin_id, to_index);
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn pins_set_group(
    app: AppHandle,
    state: State<'_, AppState>,
    pin_id: String,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.set_group(&pin_id, group_id.as_deref());
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn groups_get(state: State<'_, AppState>) -> Result<Vec<PinGroup>, AppError> {
    Ok(state.pins.lock().unwrap().groups().to_vec())
}

#[tauri::command]
pub async fn groups_add(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    emoji: Option<String>,
) -> Result<PinGroup, AppError> {
    let mut s = state.pins.lock().unwrap();
    let g = s.add_group(&name, emoji.as_deref());
    groups_changed(&app, &s);
    Ok(g)
}

#[tauri::command]
pub async fn groups_rename(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
    emoji: Option<String>,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.rename_group(&id, &name, emoji.as_deref());
    groups_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn groups_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.delete_group(&id);
    groups_changed(&app, &s);
    pins_changed(&app, &s);
    Ok(())
}

#[tauri::command]
pub async fn groups_move(
    app: AppHandle,
    state: State<'_, AppState>,
    from: Vec<usize>,
    to: usize,
) -> Result<(), AppError> {
    let mut s = state.pins.lock().unwrap();
    s.move_groups(&from, to);
    groups_changed(&app, &s);
    Ok(())
}
