use super::{document::validate_id, error::AppError, review::ProposalRevision};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_UNIT_COMMENT_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewMode {
    #[default]
    Whole,
    Changes,
}

impl ReviewMode {
    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "WHOLE" => Ok(Self::Whole),
            "CHANGES" => Ok(Self::Changes),
            _ => Err(AppError::invalid("검토 방식을 읽을 수 없습니다.")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewPlan {
    pub id: String,
    pub base_version_id: String,
    pub candidate_hash: String,
    pub algorithm_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewUnit {
    pub id: String,
    pub plan_id: String,
    pub number: u32,
    pub title: String,
    pub kind: String,
    pub reason: String,
    pub review_revision: u32,
    pub proposals: Vec<ProposalRevision>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRewriteReview {
    pub document_id: String,
    pub batch_id: String,
    pub expected_head_id: String,
    pub candidate_hash: String,
    pub operation_id: String,
}

impl StartRewriteReview {
    pub fn validate(&self) -> Result<(), AppError> {
        ids(&[
            &self.document_id,
            &self.batch_id,
            &self.expected_head_id,
            &self.operation_id,
        ])?;
        if self.candidate_hash.len() != 64
            || !self.candidate_hash.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(AppError::invalid("전체 후보의 해시를 확인해 주세요."));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReopenUnitReview {
    pub document_id: String,
    pub batch_id: String,
    pub plan_id: String,
    pub unit_id: String,
    pub expected_head_id: String,
    pub expected_review_revision: u32,
    pub operation_id: String,
}

impl ReopenUnitReview {
    pub fn validate(&self) -> Result<(), AppError> {
        ids(&[
            &self.document_id,
            &self.batch_id,
            &self.plan_id,
            &self.unit_id,
            &self.expected_head_id,
            &self.operation_id,
        ])?;
        if self.expected_review_revision == 0 || self.expected_review_revision == u32::MAX {
            return Err(AppError::invalid("검토 회차를 확인해 주세요."));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddUnitComment {
    pub id: String,
    pub batch_id: String,
    pub plan_id: String,
    pub unit_id: String,
    pub text: String,
}

impl AddUnitComment {
    pub fn validate(&self) -> Result<(), AppError> {
        ids(&[&self.id, &self.batch_id, &self.plan_id, &self.unit_id])?;
        if self.text.trim().is_empty()
            || self.text.len() > MAX_UNIT_COMMENT_BYTES
            || self.text.contains('\0')
        {
            return Err(AppError::invalid(
                "코멘트는 내용이 있는 16 KiB 이내의 텍스트로 입력해 주세요.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnitComment {
    pub id: String,
    pub task_id: String,
    pub batch_id: String,
    pub plan_id: String,
    pub unit_id: String,
    pub text: String,
    pub status: String,
    pub revision: u32,
    #[ts(type = "number")]
    pub created_at: i64,
}

fn ids(values: &[&str]) -> Result<(), AppError> {
    for value in values {
        validate_id(value)?;
    }
    Ok(())
}
