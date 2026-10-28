use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{
    SCHEMA_VERSION,
    error::{AppError, ErrorCode},
};

#[derive(Debug, Deserialize, Serialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SnapshotRequest {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
}

impl SnapshotRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(AppError::new(
                ErrorCode::SchemaUnsupported,
                "지원하지 않는 요청 버전입니다. 앱을 다시 실행해 주세요.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub head_version: u32,
    pub content_hash: String,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppSnapshot {
    pub schema_version: u32,
    pub sequence: u32,
    pub documents: Vec<DocumentSummary>,
    pub selected_document_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppEvent {
    pub schema_version: u32,
    pub sequence: u32,
    pub document_id: String,
    pub task_id: Option<String>,
    pub job_id: Option<String>,
    #[serde(flatten)]
    pub event: EventPayload,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    content = "payload",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum EventPayload {
    SaveStarted { operation_id: String },
    DocumentSaved { version: u32, content_hash: String },
    JobStarted { attempt_id: String },
    JobProgress { message: String },
    ProposalReady { batch_id: String },
    JobFailed { error: AppError },
    JobCancelled { attempt_id: String },
    ConflictDetected { message: String },
}
