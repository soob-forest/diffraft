use docreview_core::domain::{
    ai::AiResponse,
    conflict_api::{BufferCopyRequest, ConflictReply, ConflictRequest},
    connection::{ConnectionReport, ConnectionRequest},
    conversation::TaskConversation,
    document::{DocumentSnapshot, VersionSummary},
    editor::{EditorReply, EditorRequest},
    error::AppError,
    export::{ExportFileRequest, ExportRequest, ExportSaved, ExportSnapshot},
    generation::{GenerateRequest, GenerationOutcome, GenerationSnapshot},
    history::{HistoryReply, HistoryRequest},
    ipc::{AppEvent, AppSnapshot, SnapshotRequest},
    regeneration::RegenerateRequest,
    review::DecisionRequest,
    review_api::{ReviewReply, ReviewRequest},
    review_view::ReviewProjection,
    rewrite::RewriteRequest,
};
use std::{collections::BTreeMap, error::Error, fs, path::Path};
use ts_rs::{Config, TS};

fn main() -> Result<(), Box<dyn Error>> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/generated");
    let check = std::env::args().nth(1).as_deref() == Some("--check");
    let previous = if check {
        read_files(&root)?
    } else {
        BTreeMap::new()
    };
    let config = Config::new().with_out_dir(&root);
    AiResponse::export_all(&config)?;
    AppError::export_all(&config)?;
    AppSnapshot::export_all(&config)?;
    AppEvent::export_all(&config)?;
    SnapshotRequest::export_all(&config)?;
    DocumentSnapshot::export_all(&config)?;
    VersionSummary::export_all(&config)?;
    EditorRequest::export_all(&config)?;
    EditorReply::export_all(&config)?;
    DecisionRequest::export_all(&config)?;
    ReviewProjection::export_all(&config)?;
    ReviewRequest::export_all(&config)?;
    ReviewReply::export_all(&config)?;
    ConflictRequest::export_all(&config)?;
    ConflictReply::export_all(&config)?;
    BufferCopyRequest::export_all(&config)?;
    RegenerateRequest::export_all(&config)?;
    HistoryRequest::export_all(&config)?;
    HistoryReply::export_all(&config)?;
    RewriteRequest::export_all(&config)?;
    export_generation(&config)?;
    export_output(&config)?;
    fs::write(
        root.join("ai-response.schema.json"),
        serde_json::to_string_pretty(&schemars::schema_for!(AiResponse))? + "\n",
    )?;
    if check && previous != read_files(&root)? {
        return Err(
            "생성 계약이 최신 상태가 아닙니다. npm run contracts 결과를 확인하세요.".into(),
        );
    }
    Ok(())
}

fn export_generation(config: &Config) -> Result<(), Box<dyn Error>> {
    ConnectionReport::export_all(config)?;
    ConnectionRequest::export_all(config)?;
    docreview_core::domain::model::ModelSettingsRequest::export_all(config)?;
    GenerationSnapshot::export_all(config)?;
    TaskConversation::export_all(config)?;
    GenerateRequest::export_all(config)?;
    GenerationOutcome::export_all(config)?;
    Ok(())
}

fn export_output(config: &Config) -> Result<(), Box<dyn Error>> {
    ExportRequest::export_all(config)?;
    ExportSnapshot::export_all(config)?;
    ExportFileRequest::export_all(config)?;
    ExportSaved::export_all(config)?;
    Ok(())
}

fn read_files(root: &Path) -> Result<BTreeMap<String, Vec<u8>>, std::io::Error> {
    let mut files = BTreeMap::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            files.insert(
                entry.file_name().to_string_lossy().into_owned(),
                fs::read(entry.path())?,
            );
        }
    }
    Ok(files)
}
