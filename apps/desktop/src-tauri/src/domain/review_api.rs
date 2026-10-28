use super::{
    annotations::{AddComment, ReviewComment, RevisionRequest},
    document::DocumentSnapshot,
    review::{DecisionRequest, Proposal, ReviewBatch},
    review_view::ReviewProjection,
    rewrite::{BatchDecisionKind, BatchDecisionRequest},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchSummary {
    pub id: String,
    pub base_version_id: String,
    pub mode: String,
    pub status: String,
    pub summary: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskReview {
    pub batches: Vec<BatchSummary>,
    pub comments: Vec<ReviewComment>,
    pub generating: bool,
    pub sequence: u32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewRequest {
    pub schema_version: u32,
    pub action: ReviewAction,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReviewAction {
    BatchDecision {
        decision: BatchDecisionKind,
        request: BatchDecisionRequest,
    },
    State {
        task_id: String,
    },
    Projection {
        batch_id: String,
        expected_head_id: String,
    },
    Accept {
        decision: DecisionRequest,
    },
    Reject {
        decision: DecisionRequest,
    },
    Revise {
        revision: RevisionRequest,
    },
    AddComment {
        comment: AddComment,
    },
    SetCommentStatus {
        id: String,
        expected_revision: u32,
        resolved: bool,
    },
    ProposalAt {
        batch_id: String,
        proposal_id: String,
        revision: u32,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ReviewReply {
    State(TaskReview),
    Projection(ReviewProjection),
    Document(DocumentSnapshot),
    Batch(ReviewBatch),
    Comment(ReviewComment),
    Proposal(Proposal),
}
