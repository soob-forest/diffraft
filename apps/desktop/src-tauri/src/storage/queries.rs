use rusqlite::{Connection, OptionalExtension, Row, params};

use super::errors::database_error;
use crate::domain::{
    document::{DocumentSnapshot, DocumentStatus, VersionSummary},
    error::AppError,
    ipc::DocumentSummary,
};

const SNAPSHOT_SQL: &str = "SELECT d.id,d.title,d.canonical_path,v.id,v.number,v.content_utf8,v.content_hash,d.status FROM documents d JOIN versions v ON v.id=d.head_version_id WHERE d.id=?1";

fn snapshot_row(row: &Row<'_>) -> rusqlite::Result<DocumentSnapshot> {
    let status = match row.get::<_, String>(7)?.as_str() {
        "READY" => DocumentStatus::Ready,
        "CONFLICT" => DocumentStatus::Conflict,
        "RECOVERY_REQUIRED" => DocumentStatus::RecoveryRequired,
        _ => return Err(rusqlite::Error::InvalidQuery),
    };
    Ok(DocumentSnapshot {
        id: row.get(0)?,
        title: row.get(1)?,
        path: row.get(2)?,
        version_id: row.get(3)?,
        version: row.get(4)?,
        content: row.get(5)?,
        content_hash: row.get(6)?,
        status,
    })
}

pub fn snapshot(connection: &Connection, id: &str) -> Result<DocumentSnapshot, AppError> {
    connection
        .query_row(SNAPSHOT_SQL, [id], snapshot_row)
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| AppError::invalid("문서를 찾을 수 없습니다."))
}

pub fn document_at_path(connection: &Connection, path: &str) -> Result<Option<String>, AppError> {
    connection
        .query_row(
            "SELECT id FROM documents WHERE canonical_path=?1",
            [path],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)
}

pub fn summaries(connection: &Connection) -> Result<Vec<DocumentSummary>, AppError> {
    let mut statement = connection.prepare("SELECT d.id,d.title,v.number,v.content_hash FROM documents d JOIN versions v ON v.id=d.head_version_id ORDER BY d.created_at,d.id").map_err(database_error)?;
    statement
        .query_map([], |row| {
            Ok(DocumentSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                head_version: row.get(2)?,
                content_hash: row.get(3)?,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

pub fn versions(
    connection: &Connection,
    document_id: &str,
) -> Result<Vec<VersionSummary>, AppError> {
    let mut statement = connection.prepare("SELECT id,number,reason,created_at,content_hash FROM versions WHERE document_id=?1 ORDER BY number DESC").map_err(database_error)?;
    statement
        .query_map([document_id], |row| {
            Ok(VersionSummary {
                id: row.get(0)?,
                number: row.get(1)?,
                reason: row.get(2)?,
                created_at: row.get(3)?,
                content_hash: row.get(4)?,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

pub fn version_content(
    connection: &Connection,
    document_id: &str,
    number: u32,
) -> Result<String, AppError> {
    connection
        .query_row(
            "SELECT content_utf8 FROM versions WHERE document_id=?1 AND number=?2",
            params![document_id, number],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| AppError::invalid("문서 버전을 찾을 수 없습니다."))
}

pub fn set_status(
    connection: &Connection,
    document_id: &str,
    status: &str,
) -> Result<(), AppError> {
    connection
        .execute(
            "UPDATE documents SET status=?1 WHERE id=?2",
            params![status, document_id],
        )
        .map_err(database_error)?;
    if status == "CONFLICT" {
        connection.execute("UPDATE proposals SET validity='STALE' WHERE decision='PENDING' AND batch_id IN (SELECT b.id FROM proposal_batches b JOIN versions v ON b.base_version_id=v.id WHERE v.document_id=?1)", [document_id]).map_err(database_error)?;
    }
    Ok(())
}

pub fn next_sequence(connection: &Connection) -> Result<u32, AppError> {
    let last: u32 = connection
        .query_row(
            "SELECT COALESCE(MAX(seq),0) FROM decision_events",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    last.checked_add(1)
        .ok_or_else(|| AppError::invalid("작업 이벤트 수가 지원 범위를 벗어났습니다."))
}
