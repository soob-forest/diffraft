use super::{
    conflict::{ConflictComparison, RecoverySource, ResolutionRequest},
    document::{DocumentSnapshot, validate_content, validate_id},
    error::AppError,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConflictRequest {
    pub schema_version: u32,
    pub action: ConflictAction,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ConflictAction {
    Compare {
        document_id: String,
        app_content: String,
    },
    Resolve {
        resolution: ResolutionRequest,
    },
    Recover {
        document_id: String,
    },
    RecoveryCopy {
        document_id: String,
        id: String,
        source: RecoverySource,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ConflictReply {
    Comparison(ConflictComparison),
    Document(DocumentSnapshot),
    Content(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BufferCopyRequest {
    pub document_id: String,
    pub operation_id: String,
    pub content: String,
}

impl BufferCopyRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        validate_id(&self.document_id)?;
        validate_id(&self.operation_id)?;
        validate_content(&self.content)
    }
}
