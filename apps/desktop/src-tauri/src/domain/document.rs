use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{MAX_DOCUMENT_BYTES, error::AppError};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSnapshot {
    pub id: String,
    pub title: String,
    pub path: String,
    pub version_id: String,
    pub version: u32,
    pub content: String,
    pub content_hash: String,
    pub status: DocumentStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DocumentStatus {
    Ready,
    Conflict,
    RecoveryRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VersionSummary {
    pub id: String,
    pub number: u32,
    pub reason: String,
    #[ts(type = "number")]
    pub created_at: i64,
    pub content_hash: String,
}

pub fn validate_content(content: &str) -> Result<(), AppError> {
    if content.len() > MAX_DOCUMENT_BYTES {
        return Err(AppError::invalid(
            "문서는 UTF-8 기준 1 MiB까지 열거나 저장할 수 있습니다.",
        ));
    }
    if content.contains('\0') {
        return Err(AppError::invalid(
            "문서에 지원하지 않는 NUL 문자가 포함되어 있습니다.",
        ));
    }
    Ok(())
}

pub fn validate_id(id: &str) -> Result<(), AppError> {
    let parsed = uuid::Uuid::parse_str(id)
        .map_err(|_| AppError::invalid("올바르지 않은 작업 식별자입니다."))?;
    if parsed.is_nil() || parsed.to_string() != id {
        return Err(AppError::invalid("정규화되지 않은 작업 식별자입니다."));
    }
    Ok(())
}
