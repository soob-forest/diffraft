use super::{
    Store,
    errors::{conflict, database_error, lock_error},
    files, queries,
};
use crate::domain::{
    document::{DocumentSnapshot, DocumentStatus},
    error::AppError,
};
use rusqlite::params;
use std::path::Path;

impl Store {
    pub fn open_document(&self, selected: &Path) -> Result<DocumentSnapshot, AppError> {
        let path = files::selected_path(selected)?;
        let path_text = path
            .to_str()
            .ok_or_else(|| AppError::invalid("UTF-8 파일 경로만 지원합니다."))?;
        let content = files::read_document(&path)?;
        let mut connection = self.connection()?;
        if let Some(id) = queries::document_at_path(&connection, path_text)? {
            return existing_document(&connection, &id, &content);
        }
        let id = self.runtime.id();
        let version_id = self.runtime.id();
        let operation_id = self.runtime.id();
        let now = self.runtime.now_ms()?;
        let hash = files::content_hash(&content);
        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("문서");
        let newline = if content.contains("\r\n") {
            "CRLF"
        } else {
            "LF"
        };
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO documents(id,canonical_path,title,disk_hash,newline,bom,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![id,path_text,title,hash,newline,content.starts_with('\u{feff}'),now]).map_err(database_error)?;
        transaction.execute("INSERT INTO versions(id,document_id,number,content_utf8,content_hash,reason,operation_id,created_at) VALUES(?1,?2,1,?3,?4,'opened',?5,?6)", params![version_id,id,content,hash,operation_id,now]).map_err(database_error)?;
        transaction
            .execute(
                "UPDATE documents SET head_version_id=?1 WHERE id=?2",
                params![version_id, id],
            )
            .map_err(database_error)?;
        files::verify_hash(&path, &hash)?;
        transaction.commit().map_err(database_error)?;
        queries::snapshot(&connection, &id)
    }

    pub fn ensure_current(&self, id: &str) -> Result<DocumentSnapshot, AppError> {
        let document_lock = self.document_lock(id)?;
        let _guard = document_lock.lock().map_err(|_| lock_error())?;
        let connection = self.connection()?;
        let snapshot = queries::snapshot(&connection, id)?;
        if snapshot.status != DocumentStatus::Ready {
            return Err(conflict());
        }
        if files::verify_hash(Path::new(&snapshot.path), &snapshot.content_hash).is_err() {
            queries::set_status(&connection, id, "CONFLICT")?;
            return Err(conflict());
        }
        Ok(snapshot)
    }
}

fn existing_document(
    connection: &rusqlite::Connection,
    id: &str,
    disk_content: &str,
) -> Result<DocumentSnapshot, AppError> {
    let snapshot = queries::snapshot(connection, id)?;
    // A replaced file can legitimately differ while its journal awaits commit.
    if snapshot.status == DocumentStatus::Ready
        && files::content_hash(disk_content) != snapshot.content_hash
    {
        queries::set_status(connection, id, "CONFLICT")?;
    }
    queries::snapshot(connection, id)
}
