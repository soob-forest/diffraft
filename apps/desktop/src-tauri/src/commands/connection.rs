use super::{
    desktop::{AppState, blocking},
    generation::GenerationState,
};
use crate::{
    claude_adapter::connection,
    domain::{
        connection::{ConnectionAction, ConnectionReport, ConnectionRequest},
        error::AppError,
        ipc::SnapshotRequest,
    },
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn connection_command(
    app: AppHandle,
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: ConnectionRequest,
) -> Result<Option<ConnectionReport>, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        #[cfg(feature = "e2e")]
        if std::env::var_os("DOCREVIEW_E2E_DATA").is_some() {
            return super::e2e_connection::dispatch(&store, &coordinator, request.action).map(Some);
        }
        match request.action {
            ConnectionAction::Inspect => connection::inspect(store.directory()).map(Some),
            ConnectionAction::Select => {
                let Some(path) = app.dialog().file().blocking_pick_file() else {
                    return Ok(None);
                };
                let path = path
                    .into_path()
                    .map_err(|_| AppError::invalid("로컬 CLI 실행 파일을 선택해 주세요."))?;
                connection::select(store.directory(), &path).map(Some)
            }
            ConnectionAction::Test { operation_id } => {
                let guard = coordinator.begin(&operation_id)?;
                connection::test(store.directory(), &operation_id, guard.cancelled.clone())
                    .map(Some)
            }
            ConnectionAction::Login { operation_id } => {
                let guard = coordinator.begin(&operation_id)?;
                connection::login(store.directory(), guard.cancelled.clone()).map(Some)
            }
        }
    })
    .await
}
