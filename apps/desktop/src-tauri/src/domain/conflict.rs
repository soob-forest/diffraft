use super::{
    document::DocumentSnapshot,
    error::AppError,
    review_view::{DiffHunk, DiffStats},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

const SHA256_HEX_LENGTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolutionRequest {
    pub document_id: String,
    pub expected_head_id: String,
    pub expected_disk_hash: String,
    pub app_content: String,
    pub operation_id: String,
    pub choice: ResolutionChoice,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    content = "content",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum ResolutionChoice {
    External,
    Merge(String),
}

impl ResolutionRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            super::document::validate_id(id)?;
        }
        if self.expected_disk_hash.len() != SHA256_HEX_LENGTH
            || !self
                .expected_disk_hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(AppError::invalid("확인한 외부 파일의 해시가 필요합니다."));
        }
        super::document::validate_content(&self.app_content)?;
        if let ResolutionChoice::Merge(content) = &self.choice {
            super::document::validate_content(content)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryCopy {
    pub id: String,
    pub source: RecoverySource,
    pub content_hash: String,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum RecoverySource {
    AppBuffer,
    UnfinishedSave,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConflictComparison {
    pub document: DocumentSnapshot,
    pub before: String,
    pub after: String,
    pub disk_hash: Option<String>,
    pub disk_error: Option<AppError>,
    pub hunks: Vec<DiffHunk>,
    pub stats: DiffStats,
    pub recovery_copies: Vec<RecoveryCopy>,
}
