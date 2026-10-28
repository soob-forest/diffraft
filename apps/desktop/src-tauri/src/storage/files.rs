use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions, Permissions},
    io::{Read, Write},
    os::{fd::AsRawFd, unix::fs::OpenOptionsExt},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

use super::errors::{conflict, file_error};
use crate::domain::{MAX_DOCUMENT_BYTES, document::validate_content, error::AppError};

const TEMP_PREFIX: &str = ".docreview-";
const DOCUMENT_OPEN_FLAGS: libc::c_int = libc::O_NOFOLLOW | libc::O_NONBLOCK;

pub fn content_hash(content: &str) -> String {
    Sha256::digest(content.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn selected_path(path: &Path) -> Result<PathBuf, AppError> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
    {
        return Err(AppError::invalid(
            "절대 경로의 Markdown(.md) 파일을 선택해 주세요.",
        ));
    }
    let metadata = fs::symlink_metadata(path).map_err(file_error)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(AppError::invalid(
            "일반 Markdown 파일을 선택해 주세요. 심볼릭 링크는 지원하지 않습니다.",
        ));
    }
    let path = fs::canonicalize(path).map_err(file_error)?;
    if path.to_str().is_none() {
        return Err(AppError::invalid("UTF-8 파일 경로만 지원합니다."));
    }
    Ok(path)
}

pub fn read_document(path: &Path) -> Result<String, AppError> {
    if fs::canonicalize(path).map_err(file_error)? != path {
        return Err(conflict());
    }
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(DOCUMENT_OPEN_FLAGS)
        .open(path)
        .map_err(file_error)?;
    if !file.metadata().map_err(file_error)?.is_file() {
        return Err(conflict());
    }
    let mut bytes = Vec::new();
    file.take((MAX_DOCUMENT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(file_error)?;
    let content = String::from_utf8(bytes)
        .map_err(|_| AppError::invalid("UTF-8로 저장된 Markdown 파일만 지원합니다."))?;
    validate_content(&content)?;
    Ok(content)
}

pub fn verify_hash(path: &Path, expected: &str) -> Result<(), AppError> {
    let actual = read_document(path)?;
    if content_hash(&actual) != expected {
        return Err(conflict());
    }
    Ok(())
}

pub fn prepare_file(path: &Path, content: &str) -> Result<NamedTempFile, AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?;
    let original = OpenOptions::new()
        .write(true)
        .custom_flags(DOCUMENT_OPEN_FLAGS)
        .open(path)
        .map_err(file_error)?;
    let metadata = original.metadata().map_err(file_error)?;
    if !metadata.is_file() {
        return Err(conflict());
    }
    let permissions = metadata.permissions();
    let mut temp = tempfile::Builder::new()
        .prefix(TEMP_PREFIX)
        .tempfile_in(parent)
        .map_err(file_error)?;
    temp.write_all(content.as_bytes()).map_err(file_error)?;
    temp.as_file()
        .set_permissions(permissions)
        .map_err(file_error)?;
    sync_file(temp.as_file())?;
    Ok(temp)
}

pub fn replace_file(temp: NamedTempFile, destination: &Path) -> Result<(), AppError> {
    temp.persist(destination)
        .map_err(|error| file_error(error.error))?;
    sync_directory(
        destination
            .parent()
            .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?,
    )
}

pub fn sync_file(file: &File) -> Result<(), AppError> {
    file.sync_all().map_err(file_error)?;
    #[cfg(target_os = "macos")]
    {
        // F_FULLFSYNC takes no pointer; the descriptor remains owned by File.
        if unsafe { libc::fcntl(file.as_raw_fd(), libc::F_FULLFSYNC) } == -1 {
            return Err(file_error(std::io::Error::last_os_error()));
        }
    }
    Ok(())
}

pub fn sync_directory(directory: &Path) -> Result<(), AppError> {
    File::open(directory)
        .and_then(|file| file.sync_all())
        .map_err(file_error)
}

pub fn cleanup_temp(path: &Path, canonical: &Path) -> Result<(), AppError> {
    if path.parent() != canonical.parent()
        || !path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with(TEMP_PREFIX))
    {
        return Err(conflict());
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(file_error(error)),
    }
}

pub fn private_permissions() -> Permissions {
    use std::os::unix::fs::PermissionsExt;
    Permissions::from_mode(0o600)
}
