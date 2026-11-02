use super::{
    document::validate_id,
    error::AppError,
    provider::ProviderModel,
    regeneration::{CandidateSelection, MAX_INSTRUCTION_BYTES},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SelectionJobTarget {
    Confirmed(CandidateSelection),
    Rewrite {
        batch_id: String,
        candidate_hash: String,
        selection: CandidateSelection,
    },
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionRequest {
    pub model: ProviderModel,
    pub document_id: String,
    pub task_id: String,
    pub expected_head_id: String,
    pub operation_id: String,
    pub instruction: String,
    pub target: SelectionJobTarget,
    pub comment_ids: Vec<String>,
    pub context_hash: Option<String>,
    pub retry_of: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedSelection {
    pub request: SelectionRequest,
    pub context: String,
}

impl SelectionRequest {
    pub fn selection(&self) -> &CandidateSelection {
        match &self.target {
            SelectionJobTarget::Confirmed(value) => value,
            SelectionJobTarget::Rewrite { selection, .. } => selection,
        }
    }
    pub fn validate(&self) -> Result<(), AppError> {
        self.model.validate()?;
        for id in [
            &self.document_id,
            &self.task_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            validate_id(id)?;
        }
        if let Some(id) = &self.retry_of {
            validate_id(id)?;
        }
        let selection = self.selection();
        if selection.task_id != self.task_id
            || selection.from_utf16 >= selection.to_utf16
            || selection.quote.is_empty()
            || selection.quote.len() > super::MAX_DOCUMENT_BYTES
            || selection.quote.contains('\0')
            || self.instruction.trim().is_empty()
            || self.instruction.len() > MAX_INSTRUCTION_BYTES
            || self.instruction.contains('\0')
        {
            return Err(AppError::invalid("선택 범위와 수정 지시를 확인해 주세요."));
        }
        if let SelectionJobTarget::Rewrite {
            batch_id,
            candidate_hash,
            ..
        } = &self.target
        {
            validate_id(batch_id)?;
            validate_hash(candidate_hash)?;
        }
        if let Some(hash) = &self.context_hash {
            validate_hash(hash)?;
        }
        if self.comment_ids.len() > 1024 {
            return Err(AppError::invalid("전달할 코멘트 목록이 너무 큽니다."));
        }
        for id in &self.comment_ids {
            validate_id(id)?;
        }
        Ok(())
    }
}
fn validate_hash(hash: &str) -> Result<(), AppError> {
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::invalid("선택 기준을 다시 확인해 주세요."));
    }
    Ok(())
}
