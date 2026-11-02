use crate::domain::error::AppError;
use std::{
    ffi::OsString,
    fs,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
};

const FLAG: &str = "--verification-workspace";
const MARKER: &str = ".diffraft-verification";
const CONTENT: &[u8] = b"diffraft-verification-v1\n";

pub fn directory(arguments: &[OsString]) -> Result<Option<PathBuf>, AppError> {
    let positions: Vec<_> = arguments
        .iter()
        .enumerate()
        .filter(|(_, value)| *value == FLAG)
        .map(|(index, _)| index)
        .collect();
    let Some(index) = positions.first() else {
        return Ok(None);
    };
    if positions.len() != 1 {
        return Err(invalid());
    }
    let path = arguments
        .get(index + 1)
        .map(PathBuf::from)
        .ok_or_else(invalid)?;
    if !path.is_absolute() {
        return Err(invalid());
    }
    let root = verified_root(&path)?;
    let marker = root.join(MARKER);
    if owned_metadata(&marker, false)?.len() != CONTENT.len() as u64
        || fs::read(marker).map_err(|_| invalid())? != CONTENT
    {
        return Err(invalid());
    }
    let data = root.join("data");
    match fs::symlink_metadata(&data) {
        Ok(_) => {
            owned_metadata(&data, true)?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(invalid()),
    }
    Ok(Some(data))
}
fn verified_root(path: &Path) -> Result<PathBuf, AppError> {
    if owned_metadata(path, true)?.mode() & 0o777 != 0o700 {
        return Err(invalid());
    }
    let root = path.canonicalize().map_err(|_| invalid())?;
    let temporary = std::env::temp_dir().canonicalize().map_err(|_| invalid())?;
    if !root.starts_with(&temporary)
        || !root
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with("diffraft-verify-"))
    {
        return Err(invalid());
    }
    Ok(root)
}
fn owned_metadata(path: &Path, directory: bool) -> Result<fs::Metadata, AppError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| invalid())?;
    // Effective UID is read only; no process identity or permissions are changed.
    let owner = unsafe { libc::geteuid() };
    if metadata.uid() != owner
        || metadata.file_type().is_symlink()
        || (directory && !metadata.is_dir())
        || (!directory && !metadata.is_file())
    {
        return Err(invalid());
    }
    Ok(metadata)
}
fn invalid() -> AppError {
    AppError::invalid(
        "검증 작업 폴더를 확인하지 못했습니다. 소유한 전용 임시 폴더와 마커가 필요합니다. 일반 작업 공간은 열지 않았습니다.",
    )
}
