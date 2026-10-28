use super::{
    comments::task_comments, errors::database_error, generation_models::mode_name, queries,
    rewrite_validation, task_context,
};
use crate::{
    document::{review::stale, scope::select},
    domain::{
        ai::ResponseMode, document::DocumentSnapshot, editor::ScopeSnapshot, error::AppError,
        generation::GenerateRequest,
    },
};
use rusqlite::{Connection, OptionalExtension};
use serde_json::json;

pub(super) fn source(
    connection: &Connection,
    request: &GenerateRequest,
) -> Result<(DocumentSnapshot, ScopeSnapshot), AppError> {
    let head = queries::snapshot(connection, &request.document_id)?;
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    rewrite_validation::writable(connection, &head)?;
    let scope = select(&head, request.selection.clone())?;
    let active: Option<String> = connection.query_row("SELECT b.id FROM proposal_batches b JOIN jobs j ON b.job_id=j.id WHERE j.task_id=?1 AND b.status='ACTIVE'", [&request.task_id], |row| row.get(0)).optional().map_err(database_error)?;
    if active != request.expected_active_batch_id {
        return Err(stale());
    }
    if request.mode == ResponseMode::Patch && active.is_some() && !request.archive_previous {
        return Err(AppError::invalid(
            "새 제안이 완성되면 이전 제안을 기록으로 옮기는지 확인해 주세요.",
        ));
    }
    Ok((head, scope))
}

pub(super) fn build(
    connection: &Connection,
    request: &GenerateRequest,
    head: &DocumentSnapshot,
    scope: &ScopeSnapshot,
) -> Result<String, AppError> {
    let blocks: Vec<_> = scope.blocks.iter().map(|block| json!({
        "block_id": block.id, "before": block.text, "from":block.from, "to":block.to, "headingPath":block.heading_path
    })).collect();
    let mut value = json!({
        "schemaVersion":1, "mode":mode_name(request.mode), "taskId":request.task_id,
        "instruction":request.instruction,
        "confirmed":{"versionId":head.version_id,"version":head.version,"contentHash":head.content_hash},
        "scope":{"from":scope.from,"to":scope.to,"text":scope.text,"blocks":blocks},
        "comments":task_comments(connection, &request.task_id)?,
        "constraint":"Only scope.blocks are editable. Use their block_id and exact before text. Local decisions and current confirmed scope override earlier conversation. EXPLAIN returns only an answer; PATCH returns unapproved changes. Never write files."
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
