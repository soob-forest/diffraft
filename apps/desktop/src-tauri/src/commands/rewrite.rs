use super::{
    desktop::{AppState, blocking},
    generation::GenerationState,
    regeneration::launcher,
};
use crate::{
    claude_adapter::rewrite,
    domain::{error::AppError, ipc::SnapshotRequest, review::ReviewBatch, rewrite::RewriteRequest},
};
use tauri::State;

#[tauri::command]
pub async fn generate_rewrite(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
    rewrite: RewriteRequest,
) -> Result<ReviewBatch, AppError> {
    request.validate()?;
    rewrite.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        let guard = coordinator.begin(&rewrite.operation_id)?;
        rewrite::execute(&store, &launcher()?, rewrite, guard.cancelled.clone())
    })
    .await
}
