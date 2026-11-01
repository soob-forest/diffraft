use super::{
    desktop::{AppState, blocking},
    generation::GenerationState,
};
use crate::{
    codex_adapter::{connection, launch, login},
    domain::{
        ai_settings::{AiPreferences, AiSettingsRequest},
        codex::{CodexAction, CodexReport, CodexRequest},
        error::{AppError, ErrorCode},
        ipc::SnapshotRequest,
        provider::ProviderModel,
    },
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn ai_settings_command(
    state: State<'_, AppState>,
    request: AiSettingsRequest,
) -> Result<AiPreferences, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    let store = state.0.clone()?;
    blocking(move || store.update_ai_preferences(request.action)).await
}

#[tauri::command]
pub async fn resolve_request_model(
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: SnapshotRequest,
    operation_id: String,
) -> Result<ProviderModel, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        let guard = coordinator.begin(&operation_id)?;
        connection::resolve(&store, guard.cancelled.clone())
    })
    .await
}

#[tauri::command]
pub async fn codex_connection(
    app: AppHandle,
    state: State<'_, AppState>,
    generation: State<'_, GenerationState>,
    request: CodexRequest,
) -> Result<CodexReport, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    let coordinator = generation.0.clone()?;
    blocking(move || {
        let guard = coordinator.begin(&request.operation_id)?;
        if matches!(request.action, CodexAction::Login) {
            let (spec, _) =
                launch::prepare(&store, connection::DIAGNOSTIC_TASK, guard.cancelled.clone())?;
            login::login(
                &spec,
                store.directory(),
                guard.cancelled.clone(),
                |address| {
                    app.opener().open_url(address, None::<String>).map_err(|_| {
                        AppError::new(ErrorCode::AuthRequired, "공식 로그인 창을 열 수 없습니다.")
                    })
                },
            )?;
        }
        connection::inspect(
            &store,
            matches!(request.action, CodexAction::Test),
            guard.cancelled.clone(),
        )
    })
    .await
}
