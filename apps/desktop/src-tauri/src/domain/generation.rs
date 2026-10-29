use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationSnapshot {
    pub operation_id: Option<String>,
    pub cancelling: bool,
    pub blocked: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateRequest {
    #[serde(default)]
    pub model: super::model::ModelSelection,
    pub document_id: String,
    pub task_id: String,
    pub expected_head_id: String,
    pub operation_id: String,
    pub mode: super::ai::ResponseMode,
    pub selection: super::editor::ScopeSelection,
    pub instruction: String,
    pub expected_active_batch_id: Option<String>,
    pub archive_previous: bool,
    pub retry_of: Option<String>,
}

impl GenerateRequest {
    pub fn validate(&self) -> Result<(), super::error::AppError> {
        for id in [
            &self.document_id,
            &self.task_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            super::document::validate_id(id)?;
        }
        for id in [&self.expected_active_batch_id, &self.retry_of]
            .into_iter()
            .flatten()
        {
            super::document::validate_id(id)?;
        }
        if self.mode == super::ai::ResponseMode::Rewrite {
            return Err(super::error::AppError::invalid(
                "전체 재작성은 전용 요청에서 확인한 뒤 실행해 주세요.",
            ));
        }
        if self.instruction.trim().is_empty()
            || self.instruction.len() > super::regeneration::MAX_INSTRUCTION_BYTES
            || self.instruction.contains('\0')
        {
            return Err(super::error::AppError::invalid(
                "요청 내용은 1~16 KiB로 입력해 주세요.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum GenerationOutcome {
    Patch(Box<super::review::ReviewBatch>),
    Explain(String),
}
