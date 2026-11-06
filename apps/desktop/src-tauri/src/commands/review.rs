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
    dispatch_action(store, request.action)
}

fn dispatch_action(store: &Store, action: ReviewAction) -> Result<ReviewReply, AppError> {
    match action {
        ReviewAction::PrepareQuestion { request } => store
            .prepare_change_question(&request)
            .map(ReviewReply::PreparedQuestion),
        ReviewAction::PrepareSelection { request } => store
            .prepare_selection_request(request)
            .map(ReviewReply::PreparedSelection),
        ReviewAction::ReviseSelection {
            revision,
            selection,
        } => store
            .save_selection_revision(revision, selection)
            .map(ReviewReply::Batch),
        ReviewAction::PrepareRegeneration { request } => store
            .prepare_regeneration(request)
            .map(ReviewReply::PreparedRegeneration),
        ReviewAction::Historical {
            batch_id,
            proposal_id,
            revision,
            previous_revision,
        } => store
            .historical_proposal(&batch_id, &proposal_id, revision, previous_revision)
            .map(ReviewReply::Historical),
        ReviewAction::Impact { document_id } => {
            store.review_impact(&document_id).map(ReviewReply::Impact)
        }
        ReviewAction::BatchDecision { decision, request } => decide_batch(store, decision, request),
        ReviewAction::State { task_id } => store.task_review(&task_id).map(ReviewReply::State),
        ReviewAction::Projection {
            batch_id,
            expected_head_id,
        } => store
            .review_projection(&batch_id, &expected_head_id)
            .map(ReviewReply::Projection),
        action => dispatch_mutation(store, action),
    }
}

fn dispatch_mutation(store: &Store, action: ReviewAction) -> Result<ReviewReply, AppError> {
    match action {
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
        action => dispatch_unit_review(store, action),
    }
}

fn dispatch_unit_review(store: &Store, action: ReviewAction) -> Result<ReviewReply, AppError> {
    match action {
        ReviewAction::OriginalRewrite { batch_id } => store
            .original_rewrite_projection(&batch_id)
            .map(ReviewReply::Projection),
        ReviewAction::StartRewriteReview { request } => {
            store.start_rewrite_review(request).map(ReviewReply::Batch)
        }
        ReviewAction::ReopenUnitReview { request } => {
            store.reopen_unit_review(request).map(ReviewReply::Batch)
        }
        ReviewAction::AddUnitComment { comment } => store
            .add_unit_comment(comment)
            .map(ReviewReply::UnitComment),
        ReviewAction::SetUnitCommentStatus {
            id,
            expected_revision,
            resolved,
        } => store
            .set_unit_comment_status(&id, expected_revision, resolved)
            .map(ReviewReply::UnitComment),
        _ => Err(AppError::invalid("검토 명령을 확인해 주세요.")),
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
