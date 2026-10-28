use super::{
    Store,
    errors::{conflict, database_error},
    files, journal,
    models::SaveRecord,
    queries,
};
use crate::domain::error::AppError;
use rusqlite::{Connection, params};
use std::path::Path;

struct PendingSave {
    id: String,
    document_id: String,
    temp_path: String,
    payload: String,
}

impl Store {
    pub fn recover(&self) -> Result<(), AppError> {
        let mut connection = self.connection()?;
        for pending in pending_saves(&connection)? {
            recover_one(&mut connection, pending)?;
        }
        for document in queries::summaries(&connection)? {
            let snapshot = queries::snapshot(&connection, &document.id)?;
            if files::verify_hash(Path::new(&snapshot.path), &snapshot.content_hash).is_err() {
                queries::set_status(&connection, &snapshot.id, "CONFLICT")?;
            }
        }
        Ok(())
    }
}

fn pending_saves(connection: &Connection) -> Result<Vec<PendingSave>, AppError> {
    let mut statement = connection.prepare("SELECT id,document_id,temp_path,recovery_payload FROM save_operations WHERE phase='PREPARED' ORDER BY created_at,id").map_err(database_error)?;
    statement
        .query_map([], |row| {
            Ok(PendingSave {
                id: row.get(0)?,
                document_id: row.get(1)?,
                temp_path: row.get(2)?,
                payload: row.get(3)?,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

fn recover_one(connection: &mut Connection, pending: PendingSave) -> Result<(), AppError> {
    let snapshot = queries::snapshot(connection, &pending.document_id)?;
    let record: SaveRecord = serde_json::from_str(&pending.payload).map_err(|_| conflict())?;
    journal::validate_record(&record)?;
    if record.request.operation_id != pending.id || record.previous.path != snapshot.path {
        return mark_conflict(connection, &pending);
    }
    let disk = files::read_document(Path::new(&snapshot.path))
        .map(|content| files::content_hash(&content));
    match disk {
        Ok(hash) if hash == record.new_hash => journal::commit(connection, &record)?,
        Ok(hash) if hash == record.disk_base_hash() => abort(connection, &pending, &record)?,
        _ => return mark_conflict(connection, &pending),
    }
    if record.replaces_file() {
        files::cleanup_temp(Path::new(&pending.temp_path), Path::new(&snapshot.path))?;
    } else if !pending.temp_path.is_empty() {
        return Err(conflict());
    }
    Ok(())
}

fn abort(
    connection: &mut Connection,
    pending: &PendingSave,
    record: &SaveRecord,
) -> Result<(), AppError> {
    let transaction = connection.transaction().map_err(database_error)?;
    transaction
        .execute(
            "UPDATE save_operations SET phase='ABORTED' WHERE id=?1",
            [&pending.id],
        )
        .map_err(database_error)?;
    let status = if record.disk_base_hash() == record.previous.content_hash {
        "READY"
    } else {
        "CONFLICT"
    };
    queries::set_status(&transaction, &pending.document_id, status)?;
    transaction.commit().map_err(database_error)
}

fn mark_conflict(connection: &mut Connection, pending: &PendingSave) -> Result<(), AppError> {
    let transaction = connection.transaction().map_err(database_error)?;
    transaction
        .execute(
            "UPDATE save_operations SET phase='CONFLICT' WHERE id=?1 AND document_id=?2",
            params![pending.id, pending.document_id],
        )
        .map_err(database_error)?;
    queries::set_status(&transaction, &pending.document_id, "CONFLICT")?;
    transaction.commit().map_err(database_error)
}
