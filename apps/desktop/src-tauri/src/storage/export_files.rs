use super::{
    errors::{conflict, file_error},
    files,
};
use crate::domain::{document::validate_content, error::AppError};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

/// Captured only after the native save dialog has authorized the destination.
pub struct ExportDestination {
    path: PathBuf,
    previous_hash: Option<String>,
}

impl ExportDestination {
    pub fn selected(path: &Path) -> Result<Self, AppError> {
        if !path.is_absolute()
            || path.to_str().is_none()
            || !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            return Err(AppError::invalid(
                "절대 경로의 UTF-8 Markdown(.md) 파일을 선택해 주세요.",
            ));
        }
        let parent = fs::canonicalize(
            path.parent()
                .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?,
        )
        .map_err(file_error)?;
        let path = parent.join(
            path.file_name()
                .ok_or_else(|| AppError::invalid("파일 이름이 없습니다."))?,
        );
        let previous_hash = existing_hash(&path)?;
        Ok(Self {
            path,
            previous_hash,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub(super) fn write(&self, content: &str) -> Result<(), AppError> {
        validate_content(content)?;
        self.verify()?;
        if self.previous_hash.is_some() {
            let temp = files::prepare_file(&self.path, content)?;
            self.verify()?;
            files::replace_file(temp, &self.path)?;
        } else {
            self.write_new(content)?;
        }
        files::verify_hash(&self.path, &files::content_hash(content))
    }

    fn verify(&self) -> Result<(), AppError> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?;
        if fs::canonicalize(parent).map_err(file_error)? != parent
            || existing_hash(&self.path)? != self.previous_hash
        {
            return Err(conflict());
        }
        Ok(())
    }

    fn write_new(&self, content: &str) -> Result<(), AppError> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?;
        let mut temp = tempfile::Builder::new()
            .prefix(".docreview-export-")
            .tempfile_in(parent)
            .map_err(file_error)?;
        temp.write_all(content.as_bytes()).map_err(file_error)?;
        temp.as_file()
            .set_permissions(files::private_permissions())
            .map_err(file_error)?;
        files::sync_file(temp.as_file())?;
        self.verify()?;
        temp.persist_noclobber(&self.path)
            .map_err(|error| file_error(error.error))?;
        files::sync_directory(parent)
    }
}

fn existing_hash(path: &Path) -> Result<Option<String>, AppError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            files::read_document(path).map(|content| Some(files::content_hash(&content)))
        }
        Ok(_) => Err(AppError::invalid(
            "일반 Markdown 파일을 선택해 주세요. 링크나 폴더는 덮어쓰지 않습니다.",
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(file_error(error)),
    }
}
