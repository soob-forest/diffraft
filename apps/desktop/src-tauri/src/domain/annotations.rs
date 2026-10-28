use super::review::ByteRange;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum ReviewSide {
    Before,
    After,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CommentAnchor {
    pub side: ReviewSide,
    pub version_id: String,
    pub proposal_revision: u32,
    pub block_id: String,
    pub range: ByteRange,
    pub quote: String,
    pub prefix: String,
    pub suffix: String,
    pub display_revision: u32,
    pub display_range: Option<ByteRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewComment {
    pub id: String,
    pub task_id: String,
    pub proposal_id: String,
    pub anchor: CommentAnchor,
    pub text: String,
    pub status: String,
    pub revision: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddComment {
    pub id: String,
    pub batch_id: String,
    pub proposal_id: String,
    pub expected_revision: u32,
    pub side: ReviewSide,
    pub from_utf16: u32,
    pub to_utf16: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevisionRequest {
    pub document_id: String,
    pub batch_id: String,
    pub proposal_id: String,
    pub expected_revision: u32,
    pub expected_head_id: String,
    pub operation_id: String,
    pub after: String,
}
