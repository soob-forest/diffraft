use super::desktop::{AppState, blocking};
use crate::{
    claude_adapter::coordinator::Coordinator,
    domain::{error::AppError, generation::GenerationSnapshot, ipc::SnapshotRequest},
};
use std::sync::Arc;
use tauri::State;

pub struct GenerationState(pub Result<Arc<Coordinator>, AppError>);

impl GenerationState {
    pub fn new(state: &AppState) -> Self {
        Self(
            state
                .0
                .as_ref()
                .map(|store| Arc::new(Coordinator::new(store.directory())))
                .map_err(Clone::clone),
        )
    }
}

#[tauri::command]
pub async fn generation_snapshot(
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
) -> Result<GenerationSnapshot, AppError> {
    request.validate()?;
    let coordinator = generation.0.clone()?;
    blocking(move || coordinator.snapshot()).await
}

#[tauri::command]
pub async fn cancel_generation(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
    operation_id: String,
) -> Result<GenerationSnapshot, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        coordinator.cancel(&store, &operation_id)?;
        coordinator.snapshot()
    })
    .await
}

#[tauri::command]
pub async fn shutdown_generation(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
) -> Result<(), AppError> {
    request.validate()?;
    // A failed Store initialization cannot create a Coordinator or launch a CLI.
    let Ok(store) = state.0.clone() else {
        return Ok(());
    };
    let coordinator = generation.0.clone()?;
    blocking(move || coordinator.shutdown(&store)).await
}

#[tauri::command]
pub async fn generate_document(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
    input: crate::domain::generation::GenerateRequest,
) -> Result<crate::domain::generation::GenerationOutcome, AppError> {
    request.validate()?;
    input.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        let guard = coordinator.begin(&input.operation_id)?;
        crate::claude_adapter::generation::execute(
            &store,
            &super::regeneration::launcher()?,
            input,
            guard.cancelled.clone(),
        )
    })
    .await
}

#[tauri::command]
pub async fn task_conversation(
    state: State<'_, AppState>,
    request: SnapshotRequest,
    task_id: String,
    before: Option<u32>,
) -> Result<crate::domain::conversation::TaskConversation, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    blocking(move || store.task_conversation(&task_id, before)).await
}
