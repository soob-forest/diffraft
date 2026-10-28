use super::{
    errors::{conflict, database_error},
    models::{SaveEffects, SaveRecord, SaveRequest},
    queries,
};
use crate::domain::{
    document::validate_content,
    error::{AppError, ErrorCode},
};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

pub fn replay(connection: &Connection, request: &SaveRequest) -> Result<bool, AppError> {
    let Some((phase, record)) = saved_record(connection, &request.operation_id)? else {
        return Ok(false);
    };
    let same = record.request.document_id == request.document_id
        && record.request.expected_version == request.expected_version
        && record.request.content == request.content
        && record.request.reason == request.reason
        && record.effects == SaveEffects::None;
    if !same {
        return Err(AppError::invalid(
            "이미 사용한 작업 ID로 다른 저장을 요청할 수 없습니다.",
        ));
    }
    if phase != "COMMITTED" {
        return Err(conflict());
    }
    if queries::snapshot(connection, &request.document_id)?.version_id != record.version_id {
        return Err(AppError::new(
            ErrorCode::StaleBase,
            "저장 이후 문서 버전이 바뀌었습니다. 남아 있는 입력을 보존하고 최신 내용을 확인해 주세요.",
        ));
    }
    Ok(true)
}

pub fn saved_record(
    connection: &Connection,
    operation: &str,
) -> Result<Option<(String, SaveRecord)>, AppError> {
    let row: Option<(String, String)> = connection
        .query_row(
            "SELECT phase,recovery_payload FROM save_operations WHERE id=?1",
            [operation],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let Some((phase, payload)) = row else {
        return Ok(None);
    };
    let record: SaveRecord = serde_json::from_str(&payload).map_err(|_| conflict())?;
    Ok(Some((phase, record)))
}

pub fn prepare(
    connection: &mut Connection,
    record: &SaveRecord,
    temp_path: Option<&Path>,
) -> Result<(), AppError> {
    validate_record(record)?;
    if record.replaces_file() != temp_path.is_some() {
        return Err(conflict());
    }
    let temp = temp_path
        .map(|path| {
            path.to_str()
                .ok_or_else(|| AppError::invalid("UTF-8 임시 경로가 필요합니다."))
        })
        .transpose()?
        .unwrap_or("");
    let payload = serde_json::to_string(record).map_err(|_| conflict())?;
    let transaction = connection.transaction().map_err(database_error)?;
    transaction.execute("INSERT INTO save_operations(id,document_id,old_hash,new_hash,temp_path,phase,recovery_payload,created_at) VALUES(?1,?2,?3,?4,?5,'PREPARED',?6,?7)", params![record.request.operation_id,record.request.document_id,record.disk_base_hash(),record.new_hash,temp,payload,record.created_at]).map_err(database_error)?;
    queries::set_status(
        &transaction,
        &record.request.document_id,
        "RECOVERY_REQUIRED",
    )?;
    transaction.commit().map_err(database_error)
}

pub fn commit(connection: &mut Connection, record: &SaveRecord) -> Result<(), AppError> {
    validate_record(record)?;
    let transaction = connection.transaction().map_err(database_error)?;
    let current = queries::snapshot(&transaction, &record.request.document_id)?;
    if current.version_id != record.previous.version_id {
        return Err(conflict());
    }
    let version = record
        .previous
        .version
        .checked_add(1)
        .ok_or_else(|| AppError::invalid("버전 수가 지원 범위를 벗어났습니다."))?;
    transaction.execute("INSERT INTO versions(id,document_id,number,parent_id,content_utf8,content_hash,reason,operation_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![record.version_id,current.id,version,current.version_id,record.request.content,record.new_hash,record.request.reason.as_str(),record.request.operation_id,record.created_at]).map_err(database_error)?;
    update_document(&transaction, record)?;
    super::review_effects::commit(&transaction, record)?;
    insert_event(&transaction, record, version)?;
    transaction
        .execute(
            "UPDATE save_operations SET phase='COMMITTED' WHERE id=?1 AND phase='PREPARED'",
            [&record.request.operation_id],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)
}

fn update_document(connection: &Connection, record: &SaveRecord) -> Result<(), AppError> {
    let newline = if record.request.content.contains("\r\n") {
        "CRLF"
    } else {
        "LF"
    };
    connection.execute("UPDATE documents SET head_version_id=?1,disk_hash=?2,status='READY',newline=?3,bom=?4 WHERE id=?5", params![record.version_id,record.new_hash,newline,record.request.content.starts_with('\u{feff}'),record.request.document_id]).map_err(database_error)?;
    Ok(())
}

fn insert_event(
    connection: &Connection,
    record: &SaveRecord,
    version: u32,
) -> Result<(), AppError> {
    let sequence = queries::next_sequence(connection)?;
    let payload = serde_json::json!({"operationId":record.request.operation_id,"fromVersion":record.previous.version,"toVersion":version,"effects":record.effects}).to_string();
    let task = super::review_effects::task_id(connection, &record.effects)?;
    connection.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)", params![record.event_id,record.request.document_id,task,sequence,record.request.reason.as_str(),payload,record.version_id,record.created_at]).map_err(database_error)?;
    Ok(())
}

pub fn validate_record(record: &SaveRecord) -> Result<(), AppError> {
    validate_content(&record.request.content)?;
    super::review_effects::validate(record)?;
    if record.previous.id != record.request.document_id
        || record.previous.version != record.request.expected_version
        || super::files::content_hash(&record.previous.content) != record.previous.content_hash
        || super::files::content_hash(&record.request.content) != record.new_hash
    {
        return Err(conflict());
    }
    Ok(())
}
