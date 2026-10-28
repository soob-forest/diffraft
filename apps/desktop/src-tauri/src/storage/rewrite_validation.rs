use super::{
    errors::{conflict, database_error},
    files, queries, review_queries,
};
use crate::{
    document::review::stale,
    domain::{
        document::{DocumentSnapshot, DocumentStatus, validate_content},
        error::{AppError, ErrorCode},
        review::ReviewBatch,
        rewrite::BatchDecisionRequest,
    },
};
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

pub(super) fn current(
    connection: &Connection,
    request: &BatchDecisionRequest,
) -> Result<DocumentSnapshot, AppError> {
    if review_queries::active_job(connection)? {
        return Err(AppError::new(
            ErrorCode::Busy,
            "생성을 완료하거나 중단한 뒤 후보를 결정해 주세요.",
        ));
    }
    let head = queries::snapshot(connection, &request.document_id)?;
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    let pending: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM save_operations WHERE document_id=?1 AND phase='PREPARED')",
        [&head.id],
        |row| row.get(0),
    ).map_err(database_error)?;
    if head.status == DocumentStatus::RecoveryRequired || pending {
        return Err(conflict());
    }
    Ok(head)
}

pub(super) fn writable(connection: &Connection, head: &DocumentSnapshot) -> Result<(), AppError> {
    if head.status != DocumentStatus::Ready {
        return Err(conflict());
    }
    if let Err(error) = files::verify_hash(Path::new(&head.path), &head.content_hash) {
        queries::set_status(connection, &head.id, "CONFLICT")?;
        return Err(error);
    }
    Ok(())
}

pub(super) fn candidate(
    batch: &ReviewBatch,
    request: &BatchDecisionRequest,
) -> Result<String, AppError> {
    if batch.document_id != request.document_id
        || batch.id != request.batch_id
        || batch.mode != "REWRITE"
        || batch.base_version_id != request.expected_head_id
        || batch.apply_head_id != request.expected_head_id
        || !matches!(batch.status.as_str(), "ACTIVE" | "ARCHIVED")
    {
        return Err(stale());
    }
    let content = batch.candidate_markdown.clone().ok_or_else(conflict)?;
    validate_content(&content)?;
    Ok(content)
}

pub(super) fn event(
    connection: &Connection,
    operation: &str,
) -> Result<Option<(String, String)>, AppError> {
    connection
        .query_row(
            "SELECT kind,payload FROM decision_events WHERE id=?1",
            [operation],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)
}
