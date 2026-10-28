use crate::{
    domain::{
        error::AppError,
        ipc::SnapshotRequest,
        review_api::{ReviewAction, ReviewReply, ReviewRequest},
        rewrite::{BatchDecisionKind, BatchDecisionRequest},
    },
    storage::Store,
};

pub fn dispatch(store: &Store, request: ReviewRequest) -> Result<ReviewReply, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    match request.action {
        ReviewAction::BatchDecision { decision, request } => decide_batch(store, decision, request),
        ReviewAction::State { task_id } => store.task_review(&task_id).map(ReviewReply::State),
        ReviewAction::Projection {
            batch_id,
            expected_head_id,
        } => store
            .review_projection(&batch_id, &expected_head_id)
            .map(ReviewReply::Projection),
        ReviewAction::Accept { decision } => {
            store.accept_proposals(decision).map(ReviewReply::Document)
        }
        ReviewAction::Reject { decision } => {
            store.reject_proposals(decision).map(ReviewReply::Batch)
        }
        ReviewAction::Revise { revision } => store
            .save_proposal_revision(revision)
            .map(ReviewReply::Batch),
        ReviewAction::AddComment { comment } => {
            store.add_comment(comment).map(ReviewReply::Comment)
        }
        ReviewAction::SetCommentStatus {
            id,
            expected_revision,
            resolved,
        } => store
            .set_comment_status(&id, expected_revision, resolved)
            .map(ReviewReply::Comment),
        ReviewAction::ProposalAt {
            batch_id,
            proposal_id,
            revision,
        } => store
            .proposal_revision(&batch_id, &proposal_id, revision)
            .map(ReviewReply::Proposal),
    }
}

fn decide_batch(
    store: &Store,
    decision: BatchDecisionKind,
    request: BatchDecisionRequest,
) -> Result<ReviewReply, AppError> {
    match decision {
        BatchDecisionKind::ApplyRewrite => store.apply_rewrite(request).map(ReviewReply::Document),
        BatchDecisionKind::SelectRewrite => store.select_rewrite(request).map(ReviewReply::Batch),
        BatchDecisionKind::Discard => store.discard_batch(request).map(ReviewReply::Batch),
    }
}
