use super::{MAX_DOCUMENT_BYTES, document::validate_id, error::AppError};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const DRAFT_SCHEMA_VERSION: u32 = 1;
const MAX_KEY_BYTES: usize = 2048;
const MAX_VALUE_BYTES: usize = 3 * MAX_DOCUMENT_BYTES;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftWrite {
    pub key: String,
    pub schema_version: u32,
    pub expected_revision: u32,
    pub value_json: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftRecord {
    pub key: String,
    pub schema_version: u32,
    pub revision: u32,
    pub value_json: Option<String>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

impl DraftWrite {
    pub fn validate(&self) -> Result<Vec<String>, AppError> {
        if self.schema_version != DRAFT_SCHEMA_VERSION
            || self.key.len() > MAX_KEY_BYTES
            || self.expected_revision == u32::MAX
        {
            return Err(AppError::invalid(
                "초안 버전 또는 대상 키가 올바르지 않습니다.",
            ));
        }
        let parts: Vec<String> = serde_json::from_str(&self.key).map_err(|_| invalid())?;
        if !(3..=8).contains(&parts.len())
            || ![
                "request",
                "comment",
                "candidate",
                "regenerate",
                "rewrite",
                "source-scope",
                "selected-request",
            ]
            .contains(&parts[0].as_str())
            || serde_json::to_string(&parts).map_err(|_| invalid())? != self.key
        {
            return Err(invalid());
        }
        validate_id(&parts[1])?;
        validate_id(&parts[2])?;
        if let Some(value) = &self.value_json {
            if value.len() > MAX_VALUE_BYTES || value.contains('\0') {
                return Err(invalid());
            }
            let _: serde_json::Value = serde_json::from_str(value).map_err(|_| invalid())?;
        }
        Ok(parts)
    }
}
fn invalid() -> AppError {
    AppError::invalid("초안 대상 또는 저장 내용이 올바르지 않습니다.")
}
