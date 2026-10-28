use super::{
    Store,
    errors::{conflict, database_error, lock_error},
    files, journal,
    models::{SaveEffects, SaveReason, SaveRecord, SaveRequest},
    queries, review_queries, rewrite_validation,
};
use crate::domain::{document::DocumentSnapshot, error::AppError, rewrite::BatchDecisionRequest};
use rusqlite::{Connection, params};

impl Store {
    pub fn apply_rewrite(
        &self,
        request: BatchDecisionRequest,
    ) -> Result<DocumentSnapshot, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if replay(&connection, &request)? {
            return queries::snapshot(&connection, &request.document_id);
        }
        let previous = rewrite_validation::current(&connection, &request)?;
        rewrite_validation::writable(&connection, &previous)?;
        let batch = review_queries::batch(&connection, &request.batch_id)?;
        let content = rewrite_validation::candidate(&batch, &request)?;
        if batch.status != "ACTIVE" {
            return Err(AppError::invalid(
                "이전 안을 먼저 선택한 뒤 전체 적용해 주세요.",
            ));
        }
        let record = self.rewrite_record(request, previous, content)?;
        self.write_record(&mut connection, &record)?;
        queries::snapshot(&connection, &record.request.document_id)
    }

    fn rewrite_record(
        &self,
        request: BatchDecisionRequest,
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
                reason: SaveReason::Rewrite,
            },
            previous,
            version_id: self.runtime.id(),
            event_id: self.runtime.id(),
            created_at: self.runtime.now_ms()?,
            effects: SaveEffects::Rewrite { request },
        })
    }
}

fn replay(connection: &Connection, request: &BatchDecisionRequest) -> Result<bool, AppError> {
    if let Some((phase, record)) = journal::saved_record(connection, &request.operation_id)? {
        if record.effects
            != (SaveEffects::Rewrite {
                request: request.clone(),
            })
        {
            return Err(AppError::invalid(
                "같은 작업 ID의 재작성 대상을 변경할 수 없습니다.",
            ));
        }
        if phase != "COMMITTED" {
            return Err(conflict());
        }
        return Ok(true);
    }
    if rewrite_validation::event(connection, &request.operation_id)?.is_some() {
        return Err(AppError::invalid("이미 사용한 결정 ID입니다."));
    }
    Ok(false)
}

pub(super) fn validate_record(record: &SaveRecord) -> Result<(), AppError> {
    let SaveEffects::Rewrite { request } = &record.effects else {
        return if record.request.reason == SaveReason::Rewrite {
            Err(conflict())
        } else {
            Ok(())
        };
    };
    request.validate()?;
    if request.document_id != record.request.document_id
        || request.operation_id != record.request.operation_id
        || request.expected_head_id != record.previous.version_id
        || record.request.reason != SaveReason::Rewrite
    {
        return Err(conflict());
    }
    Ok(())
}

pub(super) fn commit(connection: &Connection, record: &SaveRecord) -> Result<(), AppError> {
    let SaveEffects::Rewrite { request } = &record.effects else {
        return Ok(());
    };
    let batch = review_queries::batch(connection, &request.batch_id)?;
    if batch.status != "ACTIVE"
        || rewrite_validation::candidate(&batch, request)? != record.request.content
    {
        return Err(conflict());
    }
    connection
        .execute(
            "UPDATE proposal_batches SET status='APPLIED',apply_head_id=?1 WHERE id=?2",
            params![record.version_id, batch.id],
        )
        .map_err(database_error)?;
    Ok(())
}
