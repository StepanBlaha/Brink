use super::{emit, invalid, AppState};
use crate::error::AppError;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn auth_status(state: State<'_, AppState>) -> Result<Value, AppError> {
    Ok(state.auth_status())
}

#[tauri::command]
pub async fn auth_save_token(
    app: AppHandle,
    state: State<'_, AppState>,
    token: String,
) -> Result<(), AppError> {
    state.save_token(&token).map_err(invalid)?;
    emit(&app, "auth://changed", state.auth_status());
    Ok(())
}

#[tauri::command]
pub async fn auth_disconnect(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    state.tokens.delete();
    emit(&app, "auth://changed", state.auth_status());
    Ok(())
}

/// `{ count }`: number of pages and data sources the integration can see.
#[tauri::command]
pub async fn auth_test_connection(state: State<'_, AppState>) -> Result<Value, AppError> {
    let items = state.client.search(None).await?;
    Ok(json!({ "count": items.len() }))
}

#[tauri::command]
pub async fn oauth_available() -> Result<bool, AppError> {
    Ok(false) // dormant until a client id and broker URL exist (plan 3.e)
}

#[tauri::command]
pub async fn oauth_start() -> Result<(), AppError> {
    Err(invalid("Connect to Notion is not available yet."))
}
