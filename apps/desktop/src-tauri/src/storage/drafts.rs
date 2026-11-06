use super::{Store, errors::database_error};
use crate::domain::{
    drafts::{DraftRecord, DraftWrite},
    error::AppError,
};
use rusqlite::{OptionalExtension, params};

impl Store {
    pub fn read_drafts(&self) -> Result<Vec<DraftRecord>, AppError> {
        let connection = self.connection()?;
        let mut statement=connection.prepare("SELECT key,schema_version,revision,value_json,updated_at FROM drafts UNION ALL SELECT key,schema_version,revision,value_json,updated_at FROM first_request_drafts ORDER BY updated_at,key").map_err(database_error)?;
        statement
            .query_map([], |row| {
                Ok(DraftRecord {
                    key: row.get(0)?,
                    schema_version: row.get(1)?,
                    revision: row.get(2)?,
                    value_json: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(database_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error)
    }
    pub fn write_draft(&self, request: DraftWrite) -> Result<DraftRecord, AppError> {
        let parts = request.validate()?;
        if parts[0] == "first-request" {
            return self.write_first_request(request, &parts);
        }
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let belongs: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?1 AND document_id=?2)",
                params![parts[2], parts[1]],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        if !belongs {
            return Err(AppError::invalid("초안의 문서와 작업이 일치하지 않습니다."));
        }
        let previous: Option<u32> = transaction
            .query_row(
                "SELECT revision FROM drafts WHERE key=?1",
                [&request.key],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if previous.unwrap_or(0) != request.expected_revision {
            return Err(AppError::invalid(
                "더 새로운 초안이 있습니다. 저장된 초안을 다시 확인해 주세요.",
            ));
        }
        let revision = request.expected_revision + 1;
        let updated_at = self.runtime.now_ms()?;
        transaction.execute("INSERT INTO drafts(key,document_id,task_id,schema_version,revision,value_json,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(key) DO UPDATE SET schema_version=excluded.schema_version,revision=excluded.revision,value_json=excluded.value_json,updated_at=excluded.updated_at",params![request.key,parts[1],parts[2],request.schema_version,revision,request.value_json,updated_at]).map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(DraftRecord {
            key: request.key,
            schema_version: request.schema_version,
            revision,
            value_json: request.value_json,
            updated_at,
        })
    }
}
