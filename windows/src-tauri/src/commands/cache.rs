use super::{invalid, AppState};
use crate::error::AppError;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn cache_load(
    state: State<'_, AppState>,
    pin_id: String,
    kind: String,
) -> Result<Option<Value>, AppError> {
    let text = state.cache.load(&pin_id, &kind).map_err(invalid)?;
    Ok(text.and_then(|t| serde_json::from_str(&t).ok()))
}

#[tauri::command]
pub async fn cache_save(
    state: State<'_, AppState>,
    pin_id: String,
    kind: String,
    json: Value,
) -> Result<(), AppError> {
    state
        .cache
        .save(&pin_id, &kind, &json.to_string())
        .map_err(invalid)
}

#[tauri::command]
pub async fn cache_clear(
    state: State<'_, AppState>,
    pin_id: String,
    kind: String,
) -> Result<(), AppError> {
    state.cache.clear(&pin_id, &kind).map_err(invalid)
}

#[tauri::command]
pub async fn cover_get(
    state: State<'_, AppState>,
    url: String,
    page_id: String,
) -> Result<String, AppError> {
    state
        .cover_get(&url, &page_id)
        .await
        .map_err(|m| AppError::new("cover", m))
}

/// Writes a pre-delete page backup under `<data>/backups`. The editor ignores failures.
#[tauri::command]
pub async fn page_backup(
    state: State<'_, AppState>,
    page_id: String,
    markdown: String,
) -> Result<(), AppError> {
    let since_epoch = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH);
    let now_ms = since_epoch.map_or(0, |d| d.as_millis());
    let dir = state.paths.data.join("backups");
    match crate::store::backup::write_backup(&dir, &page_id, &markdown, now_ms) {
        Ok(_) => Ok(()),
        Err(e) => Err(AppError::new("backup", e.to_string())),
    }
}
