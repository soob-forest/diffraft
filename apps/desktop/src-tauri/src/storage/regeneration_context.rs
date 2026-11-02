use super::{
    comments::task_comments, errors::conflict, files, queries, review_queries, task_context,
};
use crate::{
    document::review::{stale, valid_head},
    domain::{
        document::DocumentSnapshot,
        error::AppError,
        regeneration::{RegenerateRequest, RegenerationTarget},
        review::{Decision, Proposal, ReviewBatch, Validity},
    },
};
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use std::path::Path;

pub(super) fn execution_context(
    connection: &Connection,
    request: &RegenerateRequest,
    target: &(DocumentSnapshot, ReviewBatch, Proposal),
) -> Result<String, AppError> {
    let Some(previous) = &request.retry_of else {
        return context(connection, request, target);
    };
    super::generation_execution::verify_retry(connection, &target.1.task_id, Some(previous))?;
    let saved: Option<(String, String)> = connection
        .query_row(
            "SELECT request_json,context_json FROM revision_jobs WHERE job_id=?1",
            [previous],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(super::errors::database_error)?;
    let (saved, frozen) =
        saved.ok_or_else(|| AppError::invalid("이전 재제안 요청을 찾을 수 없습니다."))?;
    let mut saved: RegenerateRequest = serde_json::from_str(&saved)
        .map_err(|_| AppError::invalid("이전 재제안 요청을 읽을 수 없습니다."))?;
    saved.operation_id = request.operation_id.clone();
    saved.retry_of = request.retry_of.clone();
    if saved != *request {
        return Err(AppError::invalid(
            "재시도는 이전 대상·모델·지시를 그대로 사용해야 합니다.",
        ));
    }
    Ok(frozen)
}

pub(super) fn target(
    connection: &Connection,
    request: &RegenerateRequest,
) -> Result<(DocumentSnapshot, ReviewBatch, Proposal), AppError> {
    let head = queries::snapshot(connection, &request.document_id)?;
    let batch = review_queries::batch(connection, &request.batch_id)?;
    let base = review_queries::base(connection, &batch)?;
    if batch.document_id != head.id {
        return Err(stale());
    }
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
    if let Some(options) = &request.options
        && let RegenerationTarget::CandidateSelection(selection) = &options.target
    {
        if selection.task_id != batch.task_id {
            return Err(stale());
        }
        crate::document::selection::selection_range(&proposal.operation.after, selection)?;
    }
    Ok((head, batch, proposal))
}

pub(super) fn context(
    connection: &Connection,
    request: &RegenerateRequest,
    target: &(DocumentSnapshot, ReviewBatch, Proposal),
) -> Result<String, AppError> {
    let (head, batch, proposal) = target;
    let mut comments: Vec<_> = task_comments(connection, &batch.task_id)?
        .into_iter()
        .filter(|comment| comment.proposal_id == proposal.id)
        .collect();
    if let Some(ids) = request
        .options
        .as_ref()
        .and_then(|options| options.comment_ids.as_ref())
    {
        if ids
            .iter()
            .any(|id| !comments.iter().any(|comment| &comment.id == id))
        {
            return Err(AppError::invalid(
                "다른 대상의 코멘트를 전달할 수 없습니다.",
            ));
        }
        comments.retain(|comment| ids.contains(&comment.id));
    }
    let mut value = serde_json::json!({
        "schemaVersion": 1, "mode": "PATCH", "taskId": batch.task_id, "instruction": request.instruction,
        "confirmed": { "versionId": head.version_id, "version": head.version,
            "contentHash": head.content_hash },
        "scope": { "baseVersionId": batch.base_version_id,
            "blockId": proposal.operation.block_id, "text": proposal.operation.before },
        "target": proposal, "comments": comments,
        "constraint": "Only scope.text is editable and remains confirmed in the current head. Target ranges refer to scope.baseVersionId, not current head offsets. Return exactly one PATCH change for target.operation.blockId and its exact original before. Only after and reason may change. The current candidate is unapproved."
    });
    value["model"] = serde_json::to_value(&request.model)
        .map_err(|_| AppError::invalid("요청 모델을 읽을 수 없습니다."))?;
    if let Some(options) = &request.options
        && let RegenerationTarget::CandidateSelection(selection) = &options.target
    {
        value["scope"]["text"] = selection.quote.clone().into();
        value["editableSource"] = "unapproved_candidate".into();
        value["selection"] = serde_json::to_value(selection)
            .map_err(|_| AppError::invalid("선택 범위를 읽을 수 없습니다."))?;
        value["constraint"]="Only the selected quote within the unapproved candidate is editable. Candidate UTF-16 offsets refer to target.operation.after, never to confirmed scope/base offsets. Return exactly one PATCH change: block_id=target.operation.blockId, before=selection.quote, after=the replacement text only. Rust preserves all candidate text outside selection. Context is reference, not permission to edit outside selection.".into();
    }
    value
        .as_object_mut()
        .expect("context object")
        .extend(task_context::shared(connection, &head.id, &batch.task_id)?);
    task_context::bounded(&value)
}
