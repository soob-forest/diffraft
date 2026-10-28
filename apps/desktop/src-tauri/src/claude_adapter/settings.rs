use super::profile::MAX_PATH_BYTES;
use crate::{
    domain::error::{AppError, ErrorCode},
    storage::files,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
};

const SETTINGS_FILE: &str = "cli-settings.json";
const MAX_SETTINGS_BYTES: usize = 32 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Settings {
    executable: String,
}

pub fn load(directory: &Path) -> Result<Option<PathBuf>, AppError> {
    let file = match OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(directory.join(SETTINGS_FILE))
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(invalid()),
    };
    if !file.metadata().map_err(|_| invalid())?.is_file() {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    file.take((MAX_SETTINGS_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid())?;
    if bytes.len() > MAX_SETTINGS_BYTES {
        return Err(invalid());
    }
    let settings: Settings = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    let path = PathBuf::from(settings.executable);
    validate(&path)?;
    Ok(Some(path))
}

pub fn save(directory: &Path, executable: &Path) -> Result<(), AppError> {
    validate(executable)?;
    let path = directory.join(SETTINGS_FILE);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if !metadata.is_file() => return Err(invalid()),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(invalid()),
        _ => {}
    }
    let settings = Settings {
        executable: executable.to_str().ok_or_else(invalid)?.into(),
    };
    let bytes = serde_json::to_vec(&settings).map_err(|_| invalid())?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|_| invalid())?;
    temp.write_all(&bytes).map_err(|_| invalid())?;
    files::sync_file(temp.as_file())?;
    temp.persist(path).map_err(|_| invalid())?;
    files::sync_directory(directory)
}

pub fn private_directory(parent: &Path, name: &str) -> Result<PathBuf, AppError> {
    if name.is_empty()
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(invalid());
    }
    let path = parent.join(name);
    match fs::create_dir(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err(invalid()),
    }
    if !fs::symlink_metadata(&path).map_err(|_| invalid())?.is_dir() {
        return Err(invalid());
    }
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|_| invalid())?;
    Ok(path)
}

fn validate(path: &Path) -> Result<(), AppError> {
    if !path.is_absolute()
        || path.to_str().is_none()
        || path.as_os_str().len() > MAX_PATH_BYTES
        || path.as_os_str().as_encoded_bytes().contains(&0)
    {
        return Err(invalid());
    }
    Ok(())
}
fn invalid() -> AppError {
    AppError::new(
        ErrorCode::SaveFailed,
        "CLI 연결 설정을 읽거나 저장할 수 없습니다. 설치 경로를 다시 선택하고 앱 작업 폴더의 권한을 확인해 주세요.",
    )
}
