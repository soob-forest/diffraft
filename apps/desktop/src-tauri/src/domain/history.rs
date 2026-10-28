use super::{
    document::{DocumentSnapshot, VersionSummary, validate_id},
    error::AppError,
    review_view::{DiffHunk, DiffStats},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreRequest {
    pub document_id: String,
    pub expected_head_id: String,
    pub target_version_id: String,
    pub operation_id: String,
}

impl RestoreRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.expected_head_id,
            &self.target_version_id,
            &self.operation_id,
        ] {
            validate_id(id)?;
        }
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionComparison {
    pub document_id: String,
    pub current_head_id: String,
    pub current_version: u32,
    pub target: VersionSummary,
    pub before: String,
    pub after: String,
    pub hunks: Vec<DiffHunk>,
    pub stats: DiffStats,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryRequest {
    pub schema_version: u32,
    pub action: HistoryAction,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HistoryAction {
    Compare {
        document_id: String,
        expected_head_id: String,
        target_version_id: String,
    },
    Restore {
        request: RestoreRequest,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum HistoryReply {
    Comparison(VersionComparison),
    Document(DocumentSnapshot),
}
