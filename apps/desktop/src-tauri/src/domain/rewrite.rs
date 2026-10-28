use super::{document::validate_id, error::AppError};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum BatchDecisionKind {
    ApplyRewrite,
    SelectRewrite,
    Discard,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchDecisionRequest {
    pub document_id: String,
    pub batch_id: String,
    pub expected_head_id: String,
    pub operation_id: String,
}

impl BatchDecisionRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.batch_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            validate_id(id)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RewriteRequest {
    pub document_id: String,
    pub task_id: String,
    pub expected_head_id: String,
    pub expected_active_batch_id: Option<String>,
    pub reference_batch_id: Option<String>,
    pub archive_patch: bool,
    pub instruction: String,
    pub operation_id: String,
    #[serde(default)]
    pub retry_of: Option<String>,
}

impl RewriteRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.task_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            validate_id(id)?;
        }
        for id in [
            &self.expected_active_batch_id,
            &self.reference_batch_id,
            &self.retry_of,
        ]
        .into_iter()
        .flatten()
        {
            validate_id(id)?;
        }
        if self.instruction.trim().is_empty()
            || self.instruction.len() > super::regeneration::MAX_INSTRUCTION_BYTES
            || self.instruction.contains('\0')
        {
            return Err(AppError::invalid("재작성 지시는 1~16 KiB로 입력해 주세요."));
        }
        Ok(())
    }
}
