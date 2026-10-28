use super::error::AppError;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Decision {
    Pending,
    Accepted,
    Rejected,
    Superseded,
    Discarded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Validity {
    Valid,
    Stale,
    Conflict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ByteRange {
    pub from: u32,
    pub to: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditOperation {
    pub range: ByteRange,
    pub block_id: String,
    pub heading_path: Vec<String>,
    pub before: String,
    pub after: String,
    pub reason: String,
    #[serde(default)]
    pub requires_group: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Proposal {
    pub id: String,
    pub revision: u32,
    pub group_id: String,
    pub operation: EditOperation,
    pub decision: Decision,
    pub validity: Validity,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewBatch {
    pub id: String,
    pub task_id: String,
    pub document_id: String,
    pub base_version_id: String,
    pub apply_head_id: String,
    pub status: String,
    pub mode: String,
    pub summary: String,
    pub candidate_markdown: Option<String>,
    pub proposals: Vec<Proposal>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposalRevision {
    pub id: String,
    pub revision: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecisionRequest {
    pub document_id: String,
    pub batch_id: String,
    pub expected_head_id: String,
    pub proposals: Vec<ProposalRevision>,
    pub operation_id: String,
}

impl DecisionRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        for id in [
            &self.document_id,
            &self.batch_id,
            &self.expected_head_id,
            &self.operation_id,
        ] {
            super::document::validate_id(id)?;
        }
        if self.proposals.is_empty() || self.proposals.len() > super::ai::MAX_CHANGES {
            return Err(AppError::invalid("승인/거절할 제안을 선택해 주세요."));
        }
        let mut ids = std::collections::HashSet::new();
        for proposal in &self.proposals {
            super::document::validate_id(&proposal.id)?;
            if proposal.revision == 0 || !ids.insert(&proposal.id) {
                return Err(AppError::invalid("중복되거나 잘못된 제안 revision입니다."));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewJob {
    pub id: String,
    pub attempt_id: String,
}
