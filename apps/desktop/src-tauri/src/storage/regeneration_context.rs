use super::{
    comments::task_comments, errors::conflict, files, queries, review_queries, task_context,
};
use crate::{
    document::review::{stale, valid_head},
    domain::{
        document::DocumentSnapshot,
        error::AppError,
        regeneration::RegenerateRequest,
        review::{Decision, Proposal, ReviewBatch, Validity},
    },
};
use rusqlite::Connection;
use std::path::Path;

pub(super) fn target(
    connection: &Connection,
    request: &RegenerateRequest,
) -> Result<(DocumentSnapshot, ReviewBatch, Proposal), AppError> {
    let head = queries::snapshot(connection, &request.document_id)?;
    let batch = review_queries::batch(connection, &request.batch_id)?;
    let base = review_queries::base(connection, &batch)?;
    valid_head(&base, &batch, &head)?;
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    if files::verify_hash(Path::new(&head.path), &head.content_hash).is_err() {
        queries::set_status(connection, &head.id, "CONFLICT")?;
        return Err(conflict());
    }
    let proposal = batch
        .proposals
        .iter()
        .find(|p| {
            p.id == request.proposal_id
                && p.revision == request.expected_revision
                && p.decision == Decision::Pending
                && p.validity == Validity::Valid
        })
        .cloned()
        .ok_or_else(stale)?;
    Ok((head, batch, proposal))
}

pub(super) fn context(
    connection: &Connection,
    request: &RegenerateRequest,
    target: &(DocumentSnapshot, ReviewBatch, Proposal),
) -> Result<String, AppError> {
    let (head, batch, proposal) = target;
    let comments: Vec<_> = task_comments(connection, &batch.task_id)?
        .into_iter()
        .filter(|comment| comment.proposal_id == proposal.id)
        .collect();
    let mut value = serde_json::json!({
        "schemaVersion": 1, "mode": "PATCH", "taskId": batch.task_id, "instruction": request.instruction,
        "confirmed": { "versionId": head.version_id, "version": head.version,
            "contentHash": head.content_hash },
        "scope": { "baseVersionId": batch.base_version_id,
            "blockId": proposal.operation.block_id, "text": proposal.operation.before },
        "target": proposal, "comments": comments,
        "constraint": "Only scope.text is editable and remains confirmed in the current head. Target ranges refer to scope.baseVersionId, not current head offsets. Return exactly one PATCH change for target.operation.blockId and its exact original before. Only after and reason may change. The current candidate is unapproved."
    });
    value
        .as_object_mut()
        .expect("context object")
        .extend(task_context::shared(connection, &head.id, &batch.task_id)?);
    task_context::bounded(&value)
}
