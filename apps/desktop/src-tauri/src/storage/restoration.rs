use super::{
    Store,
    errors::{conflict, database_error, lock_error},
    files, history, journal,
    models::{SaveEffects, SaveReason, SaveRecord, SaveRequest},
    queries, review_queries,
};
use crate::{
    document::review::stale,
    domain::{
        document::{DocumentSnapshot, DocumentStatus},
        error::{AppError, ErrorCode},
        history::RestoreRequest,
    },
};
use rusqlite::Connection;
use std::path::Path;

impl Store {
    pub fn restore_version(&self, request: RestoreRequest) -> Result<DocumentSnapshot, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if replay(&connection, &request)? {
            return queries::snapshot(&connection, &request.document_id);
        }
        let previous = current(&connection, &request)?;
        let (_, content) = history::version(
            &connection,
            &request.document_id,
            &request.target_version_id,
        )?;
        let record = self.restore_record(request, previous, content)?;
        self.write_record(&mut connection, &record)?;
        queries::snapshot(&connection, &record.request.document_id)
    }

    fn restore_record(
        &self,
        request: RestoreRequest,
        previous: DocumentSnapshot,
        content: String,
    ) -> Result<SaveRecord, AppError> {
        Ok(SaveRecord {
            new_hash: files::content_hash(&content),
            request: SaveRequest {
                document_id: request.document_id.clone(),
                expected_version: previous.version,
                content,
                operation_id: request.operation_id.clone(),
                reason: SaveReason::Restore,
            },
            previous,
            version_id: self.runtime.id(),
            event_id: self.runtime.id(),
            created_at: self.runtime.now_ms()?,
            effects: SaveEffects::Restore { request },
        })
    }
}

fn current(
    connection: &Connection,
    request: &RestoreRequest,
) -> Result<DocumentSnapshot, AppError> {
    if review_queries::active_job(connection)? {
        return Err(AppError::new(
            ErrorCode::Busy,
            "생성을 완료하거나 중단한 뒤 버전을 복원해 주세요.",
        ));
    }
    let head = queries::snapshot(connection, &request.document_id)?;
    if head.status != DocumentStatus::Ready {
        return Err(conflict());
    }
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    if let Err(error) = files::verify_hash(Path::new(&head.path), &head.content_hash) {
        queries::set_status(connection, &head.id, "CONFLICT")?;
        return Err(error);
    }
    Ok(head)
}

fn replay(connection: &Connection, request: &RestoreRequest) -> Result<bool, AppError> {
    if let Some((phase, record)) = journal::saved_record(connection, &request.operation_id)? {
        if record.effects
            != (SaveEffects::Restore {
                request: request.clone(),
            })
        {
            return Err(AppError::invalid(
                "이미 사용한 작업 ID의 복원 대상을 변경할 수 없습니다.",
            ));
        }
        if phase != "COMMITTED" {
            return Err(conflict());
        }
        return Ok(true);
    }
    let used: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM decision_events WHERE id=?1)",
            [&request.operation_id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if used {
        return Err(AppError::invalid("이미 사용한 결정 ID입니다."));
    }
    Ok(false)
}

pub(super) fn validate_record(record: &SaveRecord) -> Result<(), AppError> {
    let SaveEffects::Restore { request } = &record.effects else {
        return if record.request.reason == SaveReason::Restore {
            Err(conflict())
        } else {
            Ok(())
        };
    };
    request.validate()?;
    if request.document_id != record.request.document_id
        || request.operation_id != record.request.operation_id
        || request.expected_head_id != record.previous.version_id
        || record.request.reason != SaveReason::Restore
    {
        return Err(conflict());
    }
    Ok(())
}

pub(super) fn commit(connection: &Connection, record: &SaveRecord) -> Result<(), AppError> {
    if let SaveEffects::Restore { request } = &record.effects {
        let (target, content) =
            history::version(connection, &request.document_id, &request.target_version_id)?;
        if content != record.request.content || target.content_hash != record.new_hash {
            return Err(conflict());
        }
    }
    Ok(())
}
