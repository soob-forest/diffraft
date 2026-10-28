use super::errors::database_error;
use crate::domain::{
    error::AppError,
    review::{Decision, Proposal, ReviewBatch, Validity},
};
use rusqlite::{Connection, OptionalExtension, Row, params};

pub fn batch(connection: &Connection, id: &str) -> Result<ReviewBatch, AppError> {
    let mut batch = connection.query_row(
        "SELECT b.id,j.task_id,t.document_id,b.base_version_id,b.apply_head_id,b.status,b.mode,b.summary,b.candidate_markdown FROM proposal_batches b JOIN jobs j ON b.job_id=j.id JOIN tasks t ON j.task_id=t.id WHERE b.id=?1",
        [id], |row| Ok(ReviewBatch {
            id: row.get(0)?, task_id: row.get(1)?, document_id: row.get(2)?, base_version_id: row.get(3)?, apply_head_id: row.get(4)?, status: row.get(5)?, mode: row.get(6)?, summary: row.get(7)?, candidate_markdown: row.get(8)?, proposals: Vec::new(),
        }),
    ).optional().map_err(database_error)?.ok_or_else(|| AppError::invalid("제안 묶음을 찾을 수 없습니다."))?;
    batch.proposals = proposals(connection, id)?;
    Ok(batch)
}

pub fn base(connection: &Connection, batch: &ReviewBatch) -> Result<String, AppError> {
    connection
        .query_row(
            "SELECT content_utf8 FROM versions WHERE id=?1 AND document_id=?2",
            [&batch.base_version_id, &batch.document_id],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn proposals(connection: &Connection, id: &str) -> Result<Vec<Proposal>, AppError> {
    let mut statement = connection.prepare("SELECT id,revision,group_id,block_anchor,decision,validity FROM proposals WHERE batch_id=?1 AND decision!='SUPERSEDED' ORDER BY created_at,id").map_err(database_error)?;
    let rows = statement
        .query_map([id], proposal_row)
        .map_err(database_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

pub fn proposal_at(
    connection: &Connection,
    batch: &str,
    id: &str,
    revision: u32,
) -> Result<Proposal, AppError> {
    connection.query_row("SELECT id,revision,group_id,block_anchor,decision,validity FROM proposals WHERE batch_id=?1 AND id=?2 AND revision=?3", params![batch,id,revision], proposal_row).optional().map_err(database_error)?.ok_or_else(|| AppError::invalid("제안 revision을 찾을 수 없습니다."))
}

fn proposal_row(row: &Row<'_>) -> rusqlite::Result<Proposal> {
    let invalid = |error: AppError| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
    };
    let operation = serde_json::from_str(&row.get::<_, String>(3)?)
        .map_err(|_| invalid(AppError::invalid("저장된 제안 범위를 읽을 수 없습니다.")))?;
    Ok(Proposal {
        id: row.get(0)?,
        revision: row.get(1)?,
        group_id: row.get(2)?,
        operation,
        decision: decision_value(&row.get::<_, String>(4)?).map_err(invalid)?,
        validity: validity_value(&row.get::<_, String>(5)?).map_err(invalid)?,
    })
}

pub fn scope(
    connection: &Connection,
    batch: &str,
) -> Result<crate::domain::editor::ScopeSnapshot, AppError> {
    let json: String = connection.query_row("SELECT j.scope_json FROM jobs j JOIN proposal_batches b ON b.job_id=j.id WHERE b.id=?1", [batch], |row| row.get(0)).map_err(database_error)?;
    serde_json::from_str(&json).map_err(|_| AppError::invalid("요청 범위를 읽을 수 없습니다."))
}

fn decision_value(value: &str) -> Result<Decision, AppError> {
    match value {
        "PENDING" => Ok(Decision::Pending),
        "ACCEPTED" => Ok(Decision::Accepted),
        "REJECTED" => Ok(Decision::Rejected),
        "SUPERSEDED" => Ok(Decision::Superseded),
        "DISCARDED" => Ok(Decision::Discarded),
        _ => Err(AppError::invalid("저장된 제안 상태가 올바르지 않습니다.")),
    }
}

fn validity_value(value: &str) -> Result<Validity, AppError> {
    match value {
        "VALID" => Ok(Validity::Valid),
        "STALE" => Ok(Validity::Stale),
        "CONFLICT" => Ok(Validity::Conflict),
        _ => Err(AppError::invalid("저장된 제안 유효성이 올바르지 않습니다.")),
    }
}

pub fn active_job(connection: &Connection) -> Result<bool, AppError> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM jobs WHERE status IN ('CREATED','RUNNING','CANCELLING'))",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)
}
