use super::{
    Store,
    errors::{database_error, lock_error},
    queries,
};
use crate::{
    document::{diff::compare, review::stale},
    domain::{
        document::{VersionSummary, validate_id},
        error::AppError,
        history::VersionComparison,
    },
};
use rusqlite::{Connection, OptionalExtension, params};

impl Store {
    pub fn version_comparison(
        &self,
        document: &str,
        expected: &str,
        target: &str,
    ) -> Result<VersionComparison, AppError> {
        validate_id(expected)?;
        validate_id(target)?;
        let lock = self.document_lock(document)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let (head, version, content) = {
            let connection = self.connection()?;
            let head = queries::snapshot(&connection, document)?;
            if head.version_id != expected {
                return Err(stale());
            }
            let (version, content) = version(&connection, document, target)?;
            (head, version, content)
        };
        let (hunks, stats) = compare(&head.content, &content, &[]);
        Ok(VersionComparison {
            document_id: head.id,
            current_head_id: head.version_id,
            current_version: head.version,
            target: version,
            before: head.content,
            after: content,
            hunks,
            stats,
        })
    }
}

pub(super) fn version(
    connection: &Connection,
    document: &str,
    id: &str,
) -> Result<(VersionSummary, String), AppError> {
    connection.query_row("SELECT id,number,reason,created_at,content_hash,content_utf8 FROM versions WHERE document_id=?1 AND id=?2", params![document, id], |row| {
        Ok((VersionSummary { id: row.get(0)?, number: row.get(1)?, reason: row.get(2)?, created_at: row.get(3)?, content_hash: row.get(4)? }, row.get(5)?))
    }).optional().map_err(database_error)?.ok_or_else(|| AppError::invalid("이 문서에 속한 복원 버전을 선택해 주세요."))
}
