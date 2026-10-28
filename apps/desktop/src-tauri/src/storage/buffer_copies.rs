use super::{
    Store,
    errors::{database_error, file_error, lock_error},
    files, queries,
};
use crate::domain::{conflict_api::BufferCopyRequest, error::AppError};
use rusqlite::{OptionalExtension, params};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

impl Store {
    pub fn save_buffer_copy(
        &self,
        request: &BufferCopyRequest,
        path: &Path,
    ) -> Result<String, AppError> {
        request.validate()?;
        let destination = new_copy_path(path)?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        self.preserve_buffer(request)?;
        write_new_copy(&destination, &request.content)?;
        Ok(destination.to_string_lossy().into_owned())
    }

    fn preserve_buffer(&self, request: &BufferCopyRequest) -> Result<(), AppError> {
        let connection = self.connection()?;
        let document = queries::snapshot(&connection, &request.document_id)?;
        let existing: Option<(String, String)> = connection
            .query_row(
                "SELECT document_id,content_utf8 FROM conflict_snapshots WHERE id=?1",
                [&request.operation_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(database_error)?;
        if let Some((id, content)) = existing {
            return if id == request.document_id && content == request.content {
                Ok(())
            } else {
                Err(AppError::invalid("다른 내용을 보존한 작업 ID입니다."))
            };
        }
        connection.execute(
            "INSERT INTO conflict_snapshots(id,document_id,head_version_id,content_utf8,content_hash,disk_hash,created_at) VALUES(?1,?2,?3,?4,?5,NULL,?6)",
            params![request.operation_id,request.document_id,document.version_id,request.content,files::content_hash(&request.content),self.runtime.now_ms()?],
        ).map_err(database_error)?;
        Ok(())
    }
}

fn new_copy_path(path: &Path) -> Result<PathBuf, AppError> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        || path.to_str().is_none()
    {
        return Err(AppError::invalid(
            "절대 경로의 UTF-8 Markdown(.md) 이름을 선택해 주세요.",
        ));
    }
    let parent = fs::canonicalize(
        path.parent()
            .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?,
    )
    .map_err(file_error)?;
    let name = path
        .file_name()
        .ok_or_else(|| AppError::invalid("파일 이름이 없습니다."))?;
    let destination = parent.join(name);
    match fs::symlink_metadata(&destination) {
        Ok(_) => Err(file_error(std::io::Error::from(
            std::io::ErrorKind::AlreadyExists,
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(destination),
        Err(error) => Err(file_error(error)),
    }
}

fn write_new_copy(path: &Path, content: &str) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".docreview-copy-")
        .tempfile_in(parent)
        .map_err(file_error)?;
    temporary
        .write_all(content.as_bytes())
        .map_err(file_error)?;
    temporary
        .as_file()
        .set_permissions(files::private_permissions())
        .map_err(file_error)?;
    files::sync_file(temporary.as_file())?;
    temporary
        .persist_noclobber(path)
        .map_err(|error| file_error(error.error))?;
    files::sync_directory(parent)
}
