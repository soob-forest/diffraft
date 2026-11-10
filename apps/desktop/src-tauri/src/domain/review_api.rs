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
pub struct ReviewImpact {
    pub first_task_id: Option<String>,
    pub proposals: u32,
    pub groups: u32,
    pub rewrites: u32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProposalComparison {
    pub base_version_id: String,
    pub proposal: Proposal,
    pub before: String,
    pub after: String,
    pub hunks: Vec<super::review_view::DiffHunk>,
    pub stats: super::review_view::DiffStats,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchSummary {
    pub id: String,
    pub base_version_id: String,
    pub mode: String,
    pub review_mode: super::unit_review::ReviewMode,
    pub status: String,
    pub summary: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskReview {
    pub batches: Vec<BatchSummary>,
    pub comments: Vec<ReviewComment>,
    pub unit_comments: Vec<super::unit_review::UnitComment>,
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
    PreparePatchReview {
        request: BatchDecisionRequest,
    },
    PrepareQuestion {
        request: super::change_question::QuestionRequest,
    },
    OriginalRewrite {
        batch_id: String,
    },
    StartRewriteReview {
        request: super::unit_review::StartRewriteReview,
    },
    ReopenUnitReview {
        request: super::unit_review::ReopenUnitReview,
    },
    AddUnitComment {
        comment: super::unit_review::AddUnitComment,
    },
    SetUnitCommentStatus {
        id: String,
        expected_revision: u32,
        resolved: bool,
    },
    PrepareSelection {
        request: super::selection_request::SelectionRequest,
    },
    ReviseSelection {
        revision: RevisionRequest,
        selection: super::regeneration::CandidateSelection,
    },
    PrepareRegeneration {
        request: super::regeneration::RegenerateRequest,
    },
    Historical {
        batch_id: String,
        proposal_id: String,
        revision: u32,
        previous_revision: Option<u32>,
    },
    Impact {
        document_id: String,
    },
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
    PreparedQuestion(super::change_question::ChangeQuestion),
    PreparedSelection(super::selection_request::PreparedSelection),
    PreparedRegeneration(super::regeneration::PreparedRegeneration),
    Historical(ProposalComparison),
    Impact(ReviewImpact),
    State(TaskReview),
    Projection(ReviewProjection),
    Document(DocumentSnapshot),
    Batch(ReviewBatch),
    Comment(ReviewComment),
    UnitComment(super::unit_review::UnitComment),
    Proposal(Proposal),
}
