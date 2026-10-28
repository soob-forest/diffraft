use super::{
    Store,
    errors::{conflict, database_error, lock_error},
    files, journal,
    models::{SaveEffects, SaveReason, SaveRecord, SaveRequest, SaveStage},
    queries, resolution_records, review_queries,
};
use crate::domain::{
    conflict::{ResolutionChoice, ResolutionRequest},
    document::{DocumentSnapshot, DocumentStatus},
    error::{AppError, ErrorCode},
};
use rusqlite::Connection;
use std::path::Path;

impl Store {
    pub fn resolve_conflict(
        &self,
        request: ResolutionRequest,
    ) -> Result<DocumentSnapshot, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if resolution_records::replay(&connection, &request)? {
            return queries::snapshot(&connection, &request.document_id);
        }
        let previous = current(&connection, &request)?;
        let disk = files::read_document(Path::new(&previous.path))?;
        if files::content_hash(&disk) != request.expected_disk_hash {
            queries::set_status(&connection, &previous.id, "CONFLICT")?;
            return Err(conflict());
        }
        let record = self.resolution_record(request, previous, disk)?;
        resolution_records::preserve(&mut connection, &record)?;
        if record.replaces_file() {
            self.write_record(&mut connection, &record)?;
        } else {
            self.adopt_external(&mut connection, &record)?;
        }
        queries::snapshot(&connection, &record.request.document_id)
    }

    fn resolution_record(
        &self,
        request: ResolutionRequest,
        previous: DocumentSnapshot,
        disk: String,
    ) -> Result<SaveRecord, AppError> {
        let (reason, content) = match &request.choice {
            ResolutionChoice::External => (SaveReason::External, disk),
            ResolutionChoice::Merge(content) => (SaveReason::Merge, content.clone()),
        };
        Ok(SaveRecord {
            new_hash: files::content_hash(&content),
            request: SaveRequest {
                document_id: request.document_id.clone(),
                expected_version: previous.version,
                content,
                operation_id: request.operation_id.clone(),
                reason,
            },
            previous,
            version_id: self.runtime.id(),
            event_id: self.runtime.id(),
            created_at: self.runtime.now_ms()?,
            effects: SaveEffects::Resolve { request },
        })
    }

    fn adopt_external(
        &self,
        connection: &mut Connection,
        record: &SaveRecord,
    ) -> Result<(), AppError> {
        journal::prepare(connection, record, None)?;
        self.checkpoint(SaveStage::Prepared)?;
        self.checkpoint(SaveStage::BeforeReplace)?;
        if let Err(error) = files::verify_hash(Path::new(&record.previous.path), &record.new_hash) {
            queries::set_status(connection, &record.request.document_id, "CONFLICT")?;
            return Err(error);
        }
        journal::commit(connection, record)?;
        self.checkpoint(SaveStage::DbCommitted)
    }
}

fn current(
    connection: &Connection,
    request: &ResolutionRequest,
) -> Result<DocumentSnapshot, AppError> {
    if review_queries::active_job(connection)? {
        return Err(AppError::new(
            ErrorCode::Busy,
            "생성을 중단하거나 완료한 뒤 파일 충돌을 해결해 주세요.",
        ));
    }
    let previous = queries::snapshot(connection, &request.document_id)?;
    if previous.status == DocumentStatus::RecoveryRequired {
        return Err(conflict());
    }
    if previous.version_id != request.expected_head_id {
        return Err(crate::document::review::stale());
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
    Ok(previous)
}

pub(super) fn validate_record(record: &SaveRecord) -> Result<(), AppError> {
    let SaveEffects::Resolve { request } = &record.effects else {
        return if matches!(
            record.request.reason,
            SaveReason::External | SaveReason::Merge
        ) {
            Err(conflict())
        } else {
            Ok(())
        };
    };
    request.validate()?;
    if request.document_id != record.request.document_id
        || request.operation_id != record.request.operation_id
        || request.expected_head_id != record.previous.version_id
    {
        return Err(conflict());
    }
    let valid = match &request.choice {
        ResolutionChoice::External => {
            record.request.reason == SaveReason::External
                && record.new_hash == request.expected_disk_hash
        }
        ResolutionChoice::Merge(content) => {
            record.request.reason == SaveReason::Merge && *content == record.request.content
        }
    };
    if valid { Ok(()) } else { Err(conflict()) }
}
