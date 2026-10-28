use super::{
    Store,
    errors::{database_error, lock_error},
    files, journal, queries,
};
use crate::{
    document::diff::compare,
    domain::{
        conflict::{ConflictComparison, RecoveryCopy, RecoverySource},
        document::{DocumentStatus, validate_content, validate_id},
        error::AppError,
    },
};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

impl Store {
    pub fn conflict_comparison(
        &self,
        document_id: &str,
        app_content: &str,
    ) -> Result<ConflictComparison, AppError> {
        validate_content(app_content)?;
        let lock = self.document_lock(document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let (document, disk, recovery_copies) = {
            let connection = self.connection()?;
            let mut document = queries::snapshot(&connection, document_id)?;
            let disk = files::read_document(Path::new(&document.path));
            let matches = disk
                .as_ref()
                .is_ok_and(|text| files::content_hash(text) == document.content_hash);
            if !matches && document.status == DocumentStatus::Ready {
                queries::set_status(&connection, document_id, "CONFLICT")?;
                document.status = DocumentStatus::Conflict;
            }
            (document, disk, recovery_copies(&connection, document_id)?)
        };
        let (after, disk_hash, disk_error) = match disk {
            Ok(content) => {
                let hash = files::content_hash(&content);
                (content, Some(hash), None)
            }
            Err(error) => (String::new(), None, Some(error)),
        };
        let (hunks, stats) = compare(app_content, &after, &[]);
        Ok(ConflictComparison {
            document,
            before: app_content.into(),
            after,
            disk_hash,
            disk_error,
            hunks,
            stats,
            recovery_copies,
        })
    }

    pub fn recovery_copy(
        &self,
        document: &str,
        id: &str,
        source: RecoverySource,
    ) -> Result<String, AppError> {
        validate_id(document)?;
        validate_id(id)?;
        let connection = self.connection()?;
        if source == RecoverySource::AppBuffer {
            return app_buffer(&connection, document, id);
        }
        if let Some((phase, record)) = journal::saved_record(&connection, id)?
            && record.request.document_id == document
            && matches!(phase.as_str(), "PREPARED" | "CONFLICT" | "ABORTED")
        {
            journal::validate_record(&record)?;
            return Ok(record.request.content);
        }
        Err(AppError::invalid(
            "이 문서의 복구용 내용을 찾을 수 없습니다.",
        ))
    }
}

fn app_buffer(connection: &Connection, document: &str, id: &str) -> Result<String, AppError> {
    let snapshot: Option<String> = connection
        .query_row(
            "SELECT content_utf8 FROM conflict_snapshots WHERE id=?1 AND document_id=?2",
            params![id, document],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    if let Some(content) = snapshot {
        validate_content(&content)?;
        return Ok(content);
    }
    Err(AppError::invalid(
        "이 문서의 복구용 내용을 찾을 수 없습니다.",
    ))
}

fn recovery_copies(connection: &Connection, document: &str) -> Result<Vec<RecoveryCopy>, AppError> {
    let mut statement = connection.prepare(
        "SELECT id,'app_buffer',content_hash,created_at FROM conflict_snapshots WHERE document_id=?1 UNION ALL SELECT id,'unfinished_save',new_hash,created_at FROM save_operations WHERE document_id=?1 AND phase IN ('PREPARED','CONFLICT','ABORTED') ORDER BY created_at DESC,id",
    ).map_err(database_error)?;
    statement
        .query_map([document], |row| {
            Ok(RecoveryCopy {
                id: row.get(0)?,
                source: match row.get::<_, String>(1)?.as_str() {
                    "app_buffer" => RecoverySource::AppBuffer,
                    "unfinished_save" => RecoverySource::UnfinishedSave,
                    _ => return Err(rusqlite::Error::InvalidQuery),
                },
                content_hash: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}
