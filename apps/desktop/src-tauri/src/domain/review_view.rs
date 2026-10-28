use super::review::{ByteRange, ProposalRevision, ReviewBatch, Validity};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewGroup {
    pub id: String,
    pub proposals: Vec<ProposalRevision>,
    pub before_ranges: Vec<ByteRange>,
    pub after_ranges: Vec<ByteRange>,
    pub validity: Validity,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffSegment {
    pub text: String,
    pub changed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffLine {
    pub kind: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub segments: Vec<DiffSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffHunk {
    pub old_range: ByteRange,
    pub new_range: ByteRange,
    pub lines: Vec<DiffLine>,
    pub group_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiffStats {
    pub added_lines: u32,
    pub removed_lines: u32,
    pub pending_groups: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewProjection {
    pub id: String,
    pub batch: ReviewBatch,
    pub current_head_id: String,
    pub before: String,
    pub after: String,
    pub groups: Vec<ReviewGroup>,
    pub hunks: Vec<DiffHunk>,
    pub stats: DiffStats,
}
