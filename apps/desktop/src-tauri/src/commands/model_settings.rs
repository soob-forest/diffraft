use super::desktop::{AppState, blocking};
use crate::{
    claude_adapter::model_settings,
    domain::{
        error::AppError,
        ipc::SnapshotRequest,
        model::{ModelSelection, ModelSettingsAction, ModelSettingsRequest},
    },
};
use tauri::State;

#[tauri::command]
pub async fn model_settings_command(
    state: State<'_, AppState>,
    request: ModelSettingsRequest,
) -> Result<ModelSelection, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    let store = state.0.clone()?;
    blocking(move || match request.action {
        ModelSettingsAction::Read => model_settings::load(store.directory()),
        ModelSettingsAction::Save { model } => model_settings::save(store.directory(), model),
    })
    .await
}
