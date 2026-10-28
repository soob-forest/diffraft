use crate::{
    domain::{ai::AiResponse, editor::ScopeSelection, error::AppError, review::ReviewBatch},
    storage::review_jobs::BeginReviewJob,
};
use std::{fs, path::PathBuf};

#[tauri::command]
pub fn e2e_process_id() -> u32 {
    std::process::id()
}

#[tauri::command]
pub fn e2e_request_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn e2e_register_ai(
    state: tauri::State<'_, super::desktop::AppState>,
    document_id: String,
    task_id: String,
    response_json: String,
) -> Result<ReviewBatch, AppError> {
    let store = state.0.clone()?;
    super::desktop::blocking(move || {
        let response = AiResponse::parse(response_json.as_bytes())?;
        let head = store.snapshot(&document_id)?;
        let job = store.begin_review_job(BeginReviewJob {
            document_id,
            task_id,
            expected_version: head.version,
            selection: ScopeSelection::Whole,
        })?;
        store.register_patch(&job, &response)
    })
    .await
}

pub fn pick_path() -> Result<PathBuf, AppError> {
    let root = std::env::var_os("DOCREVIEW_E2E_DATA")
        .ok_or_else(|| AppError::invalid("테스트 폴더가 없습니다."))?;
    let root = PathBuf::from(root);
    if !root.is_absolute() || !root.starts_with(std::env::temp_dir()) {
        return Err(AppError::invalid("테스트 임시 경로가 올바르지 않습니다."));
    }
    let selection = root.join("next-pick");
    let name = fs::read_to_string(&selection)
        .map_err(|_| AppError::invalid("다음 테스트 파일을 지정해 주세요."))?;
    if !matches!(
        name.as_str(),
        "document"
            | "readonly"
            | "large"
            | "new"
            | "review"
            | "rewrite"
            | "conflict-review"
            | "layout"
            | "performance"
            | "bulk-review"
            | "regeneration"
            | "regeneration-late"
    ) {
        return Err(AppError::invalid(
            "등록된 테스트 파일만 선택할 수 있습니다.",
        ));
    }
    fs::remove_file(selection)
        .map_err(|_| AppError::invalid("테스트 선택을 초기화할 수 없습니다."))?;
    Ok(root.join(format!("{name}.md")))
}

pub fn copy_path() -> Result<Option<PathBuf>, AppError> {
    let root = PathBuf::from(
        std::env::var_os("DOCREVIEW_E2E_DATA")
            .ok_or_else(|| AppError::invalid("테스트 폴더가 없습니다."))?,
    );
    if !root.is_absolute() || !root.starts_with(std::env::temp_dir()) {
        return Err(AppError::invalid("테스트 임시 경로가 올바르지 않습니다."));
    }
    let selection = root.join("next-copy");
    let name = fs::read_to_string(&selection)
        .map_err(|_| AppError::invalid("다음 사본을 지정해 주세요."))?;
    if !matches!(name.as_str(), "buffer-copy" | "cancel") {
        return Err(AppError::invalid("등록된 사본 이름만 선택할 수 있습니다."));
    }
    fs::remove_file(selection)
        .map_err(|_| AppError::invalid("테스트 선택을 초기화할 수 없습니다."))?;
    Ok((name == "buffer-copy").then(|| root.join("buffer-copy.md")))
}
