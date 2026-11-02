use super::{
    desktop::{AppState, blocking},
    generation::GenerationState,
    regeneration::launcher,
};
use crate::{
    domain::{
        error::AppError, ipc::SnapshotRequest, review::ReviewBatch,
        selection_request::SelectionRequest,
    },
    providers,
};
use tauri::State;

#[tauri::command]
pub async fn generate_selection(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
    input: SelectionRequest,
) -> Result<ReviewBatch, AppError> {
    request.validate()?;
    input.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        let guard = coordinator.begin(&input.operation_id)?;
        providers::selection::execute(
            &store,
            &launcher(&store, &input.model, &input.task_id)?,
            input,
            guard.cancelled.clone(),
        )
    })
    .await
}
