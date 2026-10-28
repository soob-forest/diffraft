use super::{
    comments::task_comments, errors::database_error, queries, review_queries, rewrite_validation,
    task_context,
};
use crate::{
    document::review::stale,
    domain::{
        document::DocumentSnapshot, error::AppError, review::ReviewBatch, rewrite::RewriteRequest,
    },
};
use rusqlite::{Connection, OptionalExtension};

pub(super) struct RewriteTarget {
    pub head: DocumentSnapshot,
    pub active_patch: Option<String>,
    pub context: String,
}

pub(super) fn target(
    connection: &Connection,
    request: &RewriteRequest,
) -> Result<RewriteTarget, AppError> {
    let head = queries::snapshot(connection, &request.document_id)?;
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    rewrite_validation::writable(connection, &head)?;
    let active_patch = active_batch(connection, request)?;
    let reference = reference(connection, request)?;
    let context = context(connection, request, &head, reference)?;
    Ok(RewriteTarget {
        head,
        active_patch,
        context,
    })
}

fn active_batch(
    connection: &Connection,
    request: &RewriteRequest,
) -> Result<Option<String>, AppError> {
    let active: Option<(String,String)> = connection.query_row(
        "SELECT b.id,b.mode FROM proposal_batches b JOIN jobs j ON b.job_id=j.id WHERE j.task_id=?1 AND b.status='ACTIVE'",
        [&request.task_id], |row| Ok((row.get(0)?,row.get(1)?)),
    ).optional().map_err(database_error)?;
    if active.as_ref().map(|value| &value.0) != request.expected_active_batch_id.as_ref() {
        return Err(stale());
    }
    let patch = active.filter(|(_, mode)| mode == "PATCH").map(|(id, _)| id);
    if patch.is_some() && !request.archive_patch {
        return Err(AppError::invalid(
            "이전 부분 제안을 기록으로 옮긴 뒤 전체 재작성하는지 확인해 주세요.",
        ));
    }
    Ok(patch)
}

fn reference(
    connection: &Connection,
    request: &RewriteRequest,
) -> Result<Option<ReviewBatch>, AppError> {
    let Some(id) = &request.reference_batch_id else {
        return Ok(None);
    };
    let batch = review_queries::batch(connection, id)?;
    if batch.document_id != request.document_id
        || batch.task_id != request.task_id
        || batch.base_version_id != request.expected_head_id
        || batch.mode != "REWRITE"
        || !matches!(batch.status.as_str(), "ACTIVE" | "ARCHIVED")
    {
        return Err(stale());
    }
    Ok(Some(batch))
}

fn context(
    connection: &Connection,
    request: &RewriteRequest,
    head: &DocumentSnapshot,
    reference: Option<ReviewBatch>,
) -> Result<String, AppError> {
    let reference = reference.map(|batch| serde_json::json!({
        "batchId": batch.id, "baseVersionId": batch.base_version_id, "baseContent": head.content,
        "candidateMarkdown": batch.candidate_markdown, "summary": batch.summary,
    }));
    let mut value = serde_json::json!({
        "schemaVersion": 1, "mode": "REWRITE", "taskId": request.task_id, "instruction": request.instruction,
        "confirmed": { "versionId": head.version_id, "version": head.version, "contentHash": head.content_hash, "content": head.content },
        "reference": reference, "comments": task_comments(connection, &request.task_id)?,
        "constraint": "Return REWRITE for the whole confirmed document. Reference candidates are unapproved. Never write files or apply changes."
    });
    value
        .as_object_mut()
        .expect("context object")
        .extend(task_context::shared(
            connection,
            &head.id,
            &request.task_id,
        )?);
    task_context::bounded(&value)
}
