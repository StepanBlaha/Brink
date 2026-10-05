use super::AppState;
use crate::error::AppError;
use crate::queue::{op::Operation, Outcome};
use tauri::State;

#[tauri::command]
pub async fn queue_submit(
    state: State<'_, AppState>,
    op: Operation,
    retain_on_transient_failure: Option<bool>,
) -> Result<Outcome, AppError> {
    Ok(state
        .queue
        .submit_with(
            op,
            &state.client,
            retain_on_transient_failure.unwrap_or(true),
        )
        .await)
}

#[tauri::command]
pub async fn queue_process(state: State<'_, AppState>) -> Result<(), AppError> {
    state.queue.process(&state.client).await;
    Ok(())
}

#[tauri::command]
pub async fn queue_pending_count(state: State<'_, AppState>) -> Result<usize, AppError> {
    Ok(state.queue.state().pending)
}
