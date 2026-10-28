use super::{
    desktop::{AppState, blocking},
    generation::GenerationState,
};
use crate::{
    claude_adapter::{execution::CliLauncher, regeneration},
    domain::{
        error::AppError, ipc::SnapshotRequest, regeneration::RegenerateRequest, review::ReviewBatch,
    },
};
use tauri::State;

#[tauri::command]
pub async fn regenerate_proposal(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
    revision: RegenerateRequest,
) -> Result<ReviewBatch, AppError> {
    request.validate()?;
    revision.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        let guard = coordinator.begin(&revision.operation_id)?;
        regeneration::execute(&store, &launcher()?, revision, guard.cancelled.clone())
    })
    .await
}

pub(super) fn launcher() -> Result<CliLauncher, AppError> {
    #[cfg(feature = "e2e")]
    if std::env::var_os("DOCREVIEW_E2E_DATA").is_some() {
        return super::e2e_generation::spec().map(CliLauncher::Fixture);
    }
    Ok(CliLauncher::Installed)
}
