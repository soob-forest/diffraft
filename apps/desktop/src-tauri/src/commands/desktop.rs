use crate::{
    domain::{
        conflict_api::{BufferCopyRequest, ConflictReply, ConflictRequest},
        document::DocumentSnapshot,
        editor::{EditorReply, EditorRequest},
        error::{AppError, ErrorCode},
        history::{HistoryReply, HistoryRequest},
        ipc::{AppSnapshot, SnapshotRequest},
        review_api::{ReviewReply, ReviewRequest},
    },
    storage::Store,
};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub struct AppState(pub Result<Arc<Store>, AppError>);

pub fn initialize(app: &AppHandle) -> AppState {
    AppState(
        data_directory(app)
            .and_then(|path| Store::open(&path))
            .map(Arc::new),
    )
}

fn data_directory(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    #[cfg(feature = "e2e")]
    if let Some(path) = std::env::var_os("DOCREVIEW_E2E_DATA") {
        let path = std::path::PathBuf::from(path);
        if path.is_absolute() && path.starts_with(std::env::temp_dir()) {
            return Ok(path.join("data"));
        }
        return Err(AppError::invalid("E2E 임시 경로가 올바르지 않습니다."));
    }
    app.path()
        .app_data_dir()
        .map_err(|_| AppError::new(ErrorCode::SaveFailed, "앱 작업 폴더를 찾을 수 없습니다."))
}

pub async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| {
            AppError::new(
                ErrorCode::UnknownError,
                "작업이 중단되었습니다. 내용을 유지한 채 다시 시도해 주세요.",
            )
        })?
}

#[tauri::command]
pub async fn get_workspace_snapshot(
    state: State<'_, AppState>,
    request: SnapshotRequest,
) -> Result<AppSnapshot, AppError> {
    let store = state.0.clone()?;
    blocking(move || super::workspace(&store, request)).await
}

#[tauri::command]
pub async fn editor_command(
    state: State<'_, AppState>,
    request: EditorRequest,
) -> Result<EditorReply, AppError> {
    let store = state.0.clone()?;
    blocking(move || super::editor(&store, request)).await
}

#[tauri::command]
pub async fn review_command(
    state: State<'_, AppState>,
    request: ReviewRequest,
) -> Result<ReviewReply, AppError> {
    let store = state.0.clone()?;
    blocking(move || super::review::dispatch(&store, request)).await
}

#[tauri::command]
pub async fn history_command(
    state: State<'_, AppState>,
    request: HistoryRequest,
) -> Result<HistoryReply, AppError> {
    let store = state.0.clone()?;
    blocking(move || super::history::dispatch(&store, request)).await
}

#[tauri::command]
pub async fn conflict_command(
    state: State<'_, AppState>,
    request: ConflictRequest,
) -> Result<ConflictReply, AppError> {
    let store = state.0.clone()?;
    blocking(move || super::conflict::dispatch(&store, request)).await
}

#[tauri::command]
pub async fn save_buffer_copy(
    app: AppHandle,
    state: State<'_, AppState>,
    request: BufferCopyRequest,
) -> Result<Option<String>, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    blocking(move || {
        let Some(path) = copy_destination(&app)? else {
            return Ok(None);
        };
        store.save_buffer_copy(&request, &path).map(Some)
    })
    .await
}

fn copy_destination(app: &AppHandle) -> Result<Option<std::path::PathBuf>, AppError> {
    #[cfg(feature = "e2e")]
    if std::env::var_os("DOCREVIEW_E2E_DATA").is_some() {
        return super::e2e::copy_path();
    }
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name("앱 내용 사본.md")
        .blocking_save_file()
        .map(|path| {
            path.into_path()
                .map_err(|_| AppError::invalid("로컬 파일을 선택해 주세요."))
        })
        .transpose()
}

#[tauri::command]
pub async fn pick_document(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SnapshotRequest,
) -> Result<Option<DocumentSnapshot>, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    blocking(move || {
        let Some(path) = selected_path(&app)? else {
            return Ok(None);
        };
        store.open_document(&path).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn new_document(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SnapshotRequest,
) -> Result<DocumentSnapshot, AppError> {
    request.validate()?;
    let store = state.0.clone()?;
    let directory = data_directory(&app)?;
    blocking(move || store.create_local_document(&directory)).await
}

#[tauri::command]
pub async fn open_preview_link(
    app: AppHandle,
    request: SnapshotRequest,
    href: String,
) -> Result<(), AppError> {
    request.validate()?;
    let url = crate::document::links::external_url(&href)?;
    blocking(move || {
        app.opener()
            .open_url(url, None::<String>)
            .map_err(|_| AppError::new(ErrorCode::UnknownError, "링크를 열 수 없습니다."))
    })
    .await
}

fn selected_path(app: &AppHandle) -> Result<Option<std::path::PathBuf>, AppError> {
    #[cfg(feature = "e2e")]
    if std::env::var_os("DOCREVIEW_E2E_DATA").is_some() {
        return super::e2e::pick_path().map(Some);
    }
    let dialog = app.dialog().file().add_filter("Markdown", &["md"]);
    let selected = dialog.blocking_pick_file();
    selected
        .map(|path| {
            path.into_path()
                .map_err(|_| AppError::invalid("로컬 파일을 선택해 주세요."))
        })
        .transpose()
}
