use super::{
    errors::{conflict, database_error},
    files, journal,
    models::{SaveEffects, SaveRecord},
};
use crate::domain::{conflict::ResolutionRequest, error::AppError};
use rusqlite::{Connection, OptionalExtension, params};

pub fn replay(connection: &Connection, request: &ResolutionRequest) -> Result<bool, AppError> {
    let Some((phase, record)) = journal::saved_record(connection, &request.operation_id)? else {
        return Ok(false);
    };
    if record.effects
        != (SaveEffects::Resolve {
            request: request.clone(),
        })
    {
        return Err(AppError::invalid(
            "이미 사용한 작업 ID로 다른 충돌 해결을 요청할 수 없습니다.",
        ));
    }
    if phase != "COMMITTED" {
        return Err(conflict());
    }
    Ok(true)
}

pub fn preserve(connection: &mut Connection, record: &SaveRecord) -> Result<(), AppError> {
    let SaveEffects::Resolve { request } = &record.effects else {
        return Err(conflict());
    };
    let existing: Option<(String, String, String, String)> = connection.query_row(
        "SELECT document_id,head_version_id,content_utf8,disk_hash FROM conflict_snapshots WHERE id=?1",
        [&request.operation_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).optional().map_err(database_error)?;
    if let Some((document, head, content, disk_hash)) = existing {
        if document != request.document_id
            || head != request.expected_head_id
            || content != request.app_content
            || disk_hash != request.expected_disk_hash
        {
            return Err(AppError::invalid(
                "이미 보존한 앱 내용과 다른 요청입니다. 비교 내용을 다시 확인해 주세요.",
            ));
        }
        return Ok(());
    }
    let transaction = connection.transaction().map_err(database_error)?;
    transaction.execute("INSERT INTO conflict_snapshots(id,document_id,head_version_id,content_utf8,content_hash,disk_hash,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![request.operation_id,request.document_id,record.previous.version_id,request.app_content,files::content_hash(&request.app_content),request.expected_disk_hash,record.created_at]).map_err(database_error)?;
    transaction
        .execute(
            "UPDATE save_operations SET phase='CONFLICT' WHERE document_id=?1 AND phase='PREPARED'",
            [&request.document_id],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)
}
