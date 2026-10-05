//! `notion_*` commands: JSON in, JSON out; the TypeScript side owns the typed models.

use super::{invalid, AppState};
use crate::error::AppError;
use crate::notion::encode::position_request_json;
use crate::notion::types::{BlockPosition, PropertyUpdate};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn notion_search(
    state: State<'_, AppState>,
    query: Option<String>,
) -> Result<Vec<Value>, AppError> {
    Ok(state.client.search(query.as_deref()).await?)
}

#[tauri::command]
pub async fn notion_retrieve_database(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, AppError> {
    Ok(state.client.retrieve_database(&id).await?)
}

#[tauri::command]
pub async fn notion_retrieve_data_source(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, AppError> {
    Ok(state.client.retrieve_data_source(&id).await?)
}

#[tauri::command]
pub async fn notion_query_data_source(
    state: State<'_, AppState>,
    id: String,
    filter: Option<Value>,
    sorts: Option<Value>,
) -> Result<Vec<Value>, AppError> {
    Ok(state.client.query_data_source(&id, filter, sorts).await?)
}

/// Returns `[page]` so the TS row decoder sees an array.
#[tauri::command]
pub async fn notion_create_row(
    state: State<'_, AppState>,
    data_source_id: String,
    title: String,
    extra: Option<Vec<PropertyUpdate>>,
) -> Result<Vec<Value>, AppError> {
    let page = state
        .client
        .create_row(&data_source_id, &title, &extra.unwrap_or_default())
        .await?;
    Ok(vec![page])
}

/// `properties` is a map of finished request JSON.
#[tauri::command]
pub async fn notion_update_page_properties(
    state: State<'_, AppState>,
    page_id: String,
    properties: Value,
) -> Result<Value, AppError> {
    Ok(state
        .client
        .update_page_raw(&page_id, json!({ "properties": properties }))
        .await?)
}

#[tauri::command]
pub async fn notion_set_page_emoji_icon(
    state: State<'_, AppState>,
    page_id: String,
    emoji: String,
) -> Result<Value, AppError> {
    Ok(state.client.set_page_emoji_icon(&page_id, &emoji).await?)
}

#[tauri::command]
pub async fn notion_retrieve_page(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, AppError> {
    Ok(state.client.retrieve_page(&id).await?)
}

#[tauri::command]
pub async fn notion_block_children(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, AppError> {
    Ok(state.client.block_children(&id).await?)
}

#[tauri::command]
pub async fn notion_retrieve_block(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, AppError> {
    Ok(state.client.retrieve_block(&id).await?)
}

#[tauri::command]
pub async fn notion_update_block(
    state: State<'_, AppState>,
    id: String,
    payload: Value,
) -> Result<Value, AppError> {
    Ok(state.client.update_block_raw(&id, payload).await?)
}

/// `children` are request JSON; `position` is queue-shaped and converted to the API param.
#[tauri::command]
pub async fn notion_append_blocks(
    state: State<'_, AppState>,
    parent_id: String,
    children: Vec<Value>,
    position: Option<BlockPosition>,
) -> Result<Vec<Value>, AppError> {
    let pos = position.as_ref().and_then(position_request_json);
    Ok(state
        .client
        .append_blocks_raw(&parent_id, children, pos)
        .await?)
}

#[tauri::command]
pub async fn notion_delete_block(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    Ok(state.client.delete_block(&id).await?)
}

#[derive(Deserialize)]
pub struct UploadArgs {
    pub path: Option<String>,
    pub bytes: Option<Vec<u8>>,
}

async fn upload(
    state: &AppState,
    a: UploadArgs,
    filename: &str,
    content_type: &str,
) -> Result<String, AppError> {
    let data = match (a.bytes, a.path) {
        (Some(b), _) => b,
        (None, Some(p)) => tokio::fs::read(&p)
            .await
            .map_err(|e| invalid(format!("Could not read the file: {e}")))?,
        _ => return Err(invalid("No file given.")),
    };
    Ok(state
        .client
        .upload_file(&data, filename, content_type)
        .await?)
}

#[tauri::command]
pub async fn notion_upload_file(
    state: State<'_, AppState>,
    path: Option<String>,
    bytes: Option<Vec<u8>>,
    filename: String,
    content_type: String,
) -> Result<String, AppError> {
    upload(&state, UploadArgs { path, bytes }, &filename, &content_type).await
}

#[tauri::command]
pub async fn upload_image(
    state: State<'_, AppState>,
    path: Option<String>,
    bytes: Option<Vec<u8>>,
    filename: String,
    content_type: String,
) -> Result<String, AppError> {
    upload(&state, UploadArgs { path, bytes }, &filename, &content_type).await
}

/// Image types the editor accepts from a file drop.
const DROP_IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "heic", "tif", "tiff", "bmp",
];
/// Same limit as the engine's single-part upload.
const DROP_IMAGE_LIMIT: u64 = 20 * 1024 * 1024;

pub fn is_drop_image(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| DROP_IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Raw bytes of a dropped image file (WebView2 hides file drops from the DOM, Tauri gives paths).
/// Only image extensions are readable. Too large: error kind `tooLarge`, message = byte count.
#[tauri::command]
pub async fn read_image_file(path: String) -> Result<tauri::ipc::Response, AppError> {
    if !is_drop_image(&path) {
        return Err(invalid("Not an image file."));
    }
    let len = tokio::fs::metadata(&path)
        .await
        .map_err(|e| invalid(format!("Could not read the file: {e}")))?
        .len();
    if len > DROP_IMAGE_LIMIT {
        return Err(AppError::new("tooLarge", len.to_string()));
    }
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| invalid(format!("Could not read the file: {e}")))?;
    Ok(tauri::ipc::Response::new(data))
}

#[cfg(test)]
mod drop_tests {
    use super::*;

    #[test]
    fn only_images_may_be_read() {
        assert!(is_drop_image("C:\\Users\\me\\pic.JPG"));
        assert!(is_drop_image("/tmp/a.webp"));
        assert!(!is_drop_image("/etc/passwd"));
        assert!(!is_drop_image("C:\\secrets.txt"));
        assert!(!is_drop_image("png"));
    }
}
