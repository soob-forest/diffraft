use super::{document::validate_id, error::AppError};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum QuestionSubject {
    Proposal { id: String, revision: u32 },
    Unit { id: String, revision: u32 },
    Whole,
}
impl QuestionSubject {
    pub fn validate(&self) -> Result<(), AppError> {
        match self {
            Self::Proposal { id, revision } | Self::Unit { id, revision } => {
                validate_id(id)?;
                if *revision == 0 || *revision == u32::MAX {
                    return Err(AppError::invalid("질문할 수정안의 차수를 확인해 주세요."));
                }
            }
            Self::Whole => {}
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuestionRequest {
    pub document_id: String,
    pub task_id: String,
    pub batch_id: String,
    pub expected_head_id: String,
    pub subject: QuestionSubject,
}
impl QuestionRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.task_id,
            &self.batch_id,
            &self.expected_head_id,
        ] {
            validate_id(id)?;
        }
        self.subject.validate()
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuestionChange {
    pub id: String,
    pub before: String,
    pub after: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangeQuestion {
    pub document_id: String,
    pub task_id: String,
    pub batch_id: String,
    pub base_version_id: String,
    pub subject: QuestionSubject,
    pub label: String,
    pub changes: Vec<QuestionChange>,
    pub content_hash: String,
}
