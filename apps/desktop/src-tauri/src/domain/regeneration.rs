use super::{annotations::RevisionRequest, document::validate_id, error::AppError};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_INSTRUCTION_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegenerateRequest {
    pub document_id: String,
    pub batch_id: String,
    pub proposal_id: String,
    pub expected_revision: u32,
    pub expected_head_id: String,
    pub operation_id: String,
    pub instruction: String,
    #[serde(default)]
    pub retry_of: Option<String>,
}

impl RegenerateRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.batch_id,
            &self.proposal_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            validate_id(id)?;
        }
        if let Some(id) = &self.retry_of {
            validate_id(id)?;
        }
        if self.expected_revision == 0
            || self.instruction.trim().is_empty()
            || self.instruction.len() > MAX_INSTRUCTION_BYTES
            || self.instruction.contains('\0')
        {
            return Err(AppError::invalid("재제안 지시는 1~16 KiB로 입력해 주세요."));
        }
        Ok(())
    }

    pub fn revision(&self, after: String) -> RevisionRequest {
        RevisionRequest {
            document_id: self.document_id.clone(),
            batch_id: self.batch_id.clone(),
            proposal_id: self.proposal_id.clone(),
            expected_revision: self.expected_revision,
            expected_head_id: self.expected_head_id.clone(),
            operation_id: self.operation_id.clone(),
            after,
        }
    }
}
