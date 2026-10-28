use super::{Store, errors::file_error, files};
use crate::domain::{document::DocumentSnapshot, error::AppError};
use std::{fs, os::unix::fs::PermissionsExt, path::Path};

impl Store {
    pub fn create_local_document(
        &self,
        data_directory: &Path,
    ) -> Result<DocumentSnapshot, AppError> {
        let documents = data_directory.join("documents");
        private_directory(&documents)?;
        let directory = documents.join(self.runtime.id());
        private_directory(&directory)?;
        self.create_document(&directory.join("새 문서.md"))
    }
}

fn private_directory(path: &Path) -> Result<(), AppError> {
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(file_error(error)),
    }
    let metadata = fs::symlink_metadata(path).map_err(file_error)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(AppError::invalid(
            "앱 문서 폴더에 심볼릭 링크를 사용할 수 없습니다.",
        ));
    }
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(file_error)?;
    if let Some(parent) = path.parent() {
        files::sync_directory(parent)?;
    }
    Ok(())
}
