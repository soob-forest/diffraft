use super::desktop::{AppState, blocking};
use crate::{
    domain::{
        error::{AppError, ErrorCode},
        export::{ExportFileKind, ExportFileRequest, ExportRequest, ExportSaved, ExportSnapshot},
    },
    storage::export_files::ExportDestination,
};
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn export_snapshot(
    state: State<'_, AppState>,
    request: ExportRequest,
) -> Result<ExportSnapshot, AppError> {
    let store = state.0.clone()?;
    blocking(move || store.export_snapshot(&request)).await
}

#[tauri::command]
pub async fn copy_export(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ExportRequest,
) -> Result<(), AppError> {
    let store = state.0.clone()?;
    blocking(move || {
        let snapshot = store.export_snapshot(&request)?;
        app.clipboard()
            .write_text(snapshot.document.content)
            .map_err(|_| {
                AppError::new(
                    ErrorCode::SaveFailed,
                    "클립보드에 복사할 수 없습니다. 다시 시도하거나 .md 사본으로 저장해 주세요.",
                )
            })
    })
    .await
}

#[tauri::command]
pub async fn save_export(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ExportFileRequest,
) -> Result<Option<ExportSaved>, AppError> {
    request.snapshot.validate()?;
    let store = state.0.clone()?;
    blocking(move || {
        store.export_snapshot(&request.snapshot)?;
        let Some(path) = destination(&app, request.kind)? else {
            return Ok(None);
        };
        let selected = ExportDestination::selected(&path)?;
        store.export_file(&request, &selected).map(Some)
    })
    .await
}

fn destination(app: &AppHandle, kind: ExportFileKind) -> Result<Option<PathBuf>, AppError> {
    #[cfg(feature = "e2e")]
    if std::env::var_os("DOCREVIEW_E2E_DATA").is_some() {
        return super::e2e_export::destination();
    }
    let (title, name) = match kind {
        ExportFileKind::Copy => ("확정본 .md 사본 저장", "확정본 사본.md"),
        ExportFileKind::WorkingFile => ("다른 이름으로 작업 파일 저장", "작업 문서.md"),
    };
    app.dialog()
        .file()
        .set_title(title)
        .add_filter("Markdown", &["md"])
        .set_file_name(name)
        .blocking_save_file()
        .map(|path| {
            path.into_path()
                .map_err(|_| AppError::invalid("로컬 파일을 선택해 주세요."))
        })
        .transpose()
}
