use super::{
    Store,
    errors::{conflict, lock_error},
    files, journal,
    models::{SaveEffects, SaveReason, SaveRecord, SaveRequest, SaveStage},
    queries,
};
use crate::domain::{
    document::{DocumentSnapshot, DocumentStatus, validate_content, validate_id},
    error::{AppError, ErrorCode},
};
use std::path::Path;

impl Store {
    pub fn save(&self, request: SaveRequest) -> Result<DocumentSnapshot, AppError> {
        if matches!(
            request.reason,
            SaveReason::Accept
                | SaveReason::Rewrite
                | SaveReason::Restore
                | SaveReason::External
                | SaveReason::Merge
        ) {
            return Err(AppError::invalid(
                "승인·재작성·복원·충돌 해결은 해당 결정 경로를 사용해 주세요.",
            ));
        }
        validate_content(&request.content)?;
        validate_id(&request.operation_id)?;
        let document_lock = self.document_lock(&request.document_id)?;
        let _guard = document_lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        let replay = journal::replay(&connection, &request)?;
        let previous = queries::snapshot(&connection, &request.document_id)?;
        if !replay {
            validate_head(&previous, &request)?;
        }
        verify_disk(&connection, &previous)?;
        if replay {
            return Ok(previous);
        }
        let record = SaveRecord {
            new_hash: files::content_hash(&request.content),
            request,
            previous,
            version_id: self.runtime.id(),
            event_id: self.runtime.id(),
            created_at: self.runtime.now_ms()?,
            effects: SaveEffects::None,
        };
        self.write_record(&mut connection, &record)?;
        queries::snapshot(&connection, &record.request.document_id)
    }

    pub(super) fn write_record(
        &self,
        connection: &mut rusqlite::Connection,
        record: &SaveRecord,
    ) -> Result<(), AppError> {
        let path = Path::new(&record.previous.path);
        let temp = files::prepare_file(path, &record.request.content)?;
        self.checkpoint(SaveStage::TempWritten)?;
        journal::prepare(connection, record, Some(temp.path()))?;
        self.checkpoint(SaveStage::Prepared)?;
        self.checkpoint(SaveStage::BeforeReplace)?;
        if let Err(error) = files::verify_hash(path, record.disk_base_hash()) {
            queries::set_status(connection, &record.request.document_id, "CONFLICT")?;
            return Err(error);
        }
        files::replace_file(temp, path)?;
        self.checkpoint(SaveStage::FileReplaced)?;
        files::verify_hash(path, &record.new_hash)?;
        journal::commit(connection, record)?;
        self.checkpoint(SaveStage::DbCommitted)?;
        Ok(())
    }
}

fn verify_disk(
    connection: &rusqlite::Connection,
    previous: &DocumentSnapshot,
) -> Result<(), AppError> {
    if previous.status != DocumentStatus::Ready {
        return Err(conflict());
    }
    if let Err(error) = files::verify_hash(Path::new(&previous.path), &previous.content_hash) {
        queries::set_status(connection, &previous.id, "CONFLICT")?;
        return Err(error);
    }
    Ok(())
}

fn validate_head(previous: &DocumentSnapshot, request: &SaveRequest) -> Result<(), AppError> {
    if previous.status != DocumentStatus::Ready {
        return Err(conflict());
    }
    if previous.version != request.expected_version {
        return Err(AppError::new(
            ErrorCode::StaleBase,
            "문서 버전이 바뀌었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
        ));
    }
    Ok(())
}
