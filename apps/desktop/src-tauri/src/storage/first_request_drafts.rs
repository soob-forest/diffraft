use super::{Store, errors::database_error};
use crate::domain::{
    drafts::{DraftRecord, DraftWrite},
    error::AppError,
};
use rusqlite::{OptionalExtension, params};

impl Store {
    pub(super) fn write_first_request(
        &self,
        request: DraftWrite,
        parts: &[String],
    ) -> Result<DraftRecord, AppError> {
        let mut db = self.connection()?;
        let tx = db.transaction().map_err(database_error)?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM documents WHERE id=?1)",
                [&parts[1]],
                |r| r.get(0),
            )
            .map_err(database_error)?;
        if !exists || parts.len() != 3 {
            return Err(AppError::invalid(
                "첫 요청의 문서와 임시 작업을 확인해 주세요.",
            ));
        }
        let previous: Option<u32> = tx
            .query_row(
                "SELECT revision FROM first_request_drafts WHERE key=?1",
                [&request.key],
                |r| r.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if previous.unwrap_or(0) != request.expected_revision {
            return Err(AppError::invalid(
                "더 새로운 첫 요청 초안이 있습니다. 다시 확인해 주세요.",
            ));
        }
        let revision = request.expected_revision + 1;
        let updated_at = self.runtime.now_ms()?;
        tx.execute(
            "INSERT INTO first_request_drafts(key,document_id,task_id,schema_version,revision,value_json,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json,updated_at=excluded.updated_at",
            params![request.key,parts[1],parts[2],request.schema_version,revision,request.value_json,updated_at],
        ).map_err(database_error)?;
        tx.commit().map_err(database_error)?;
        Ok(DraftRecord {
            key: request.key,
            schema_version: request.schema_version,
            revision,
            value_json: request.value_json,
            updated_at,
        })
    }
}
