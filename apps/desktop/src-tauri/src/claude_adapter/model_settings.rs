use crate::{
    domain::{
        error::{AppError, ErrorCode},
        model::ModelSelection,
    },
    storage::files,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::unix::fs::OpenOptionsExt,
    path::Path,
    sync::Mutex,
};

const SETTINGS_FILE: &str = "model-settings.json";
const MAX_SETTINGS_BYTES: usize = 1024;
const DEFAULT_MODEL: ModelSelection = ModelSelection::Opus;
// The Store owns the cross-process writer lease. Serialize settings within that process.
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Settings {
    model: ModelSelection,
}

pub fn load(directory: &Path) -> Result<ModelSelection, AppError> {
    let _guard = SETTINGS_LOCK.lock().map_err(|_| invalid())?;
    read(directory)
}

fn read(directory: &Path) -> Result<ModelSelection, AppError> {
    let file = match OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(directory.join(SETTINGS_FILE))
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DEFAULT_MODEL);
        }
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
    Ok(settings.model)
}

pub fn save(directory: &Path, model: ModelSelection) -> Result<ModelSelection, AppError> {
    let _guard = SETTINGS_LOCK.lock().map_err(|_| invalid())?;
    let path = directory.join(SETTINGS_FILE);
    match fs::symlink_metadata(&path) {
        Ok(metadata) if !metadata.is_file() => return Err(invalid()),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(invalid()),
        _ => {}
    }
    // Corrupt settings require explicit repair rather than silently replacing evidence.
    read(directory)?;
    let bytes = serde_json::to_vec(&Settings { model }).map_err(|_| invalid())?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|_| invalid())?;
    temp.write_all(&bytes).map_err(|_| invalid())?;
    files::sync_file(temp.as_file())?;
    temp.persist(path).map_err(|_| invalid())?;
    files::sync_directory(directory)?;
    Ok(model)
}

fn invalid() -> AppError {
    AppError::new(
        ErrorCode::SaveFailed,
        "모델 설정을 읽거나 저장할 수 없습니다. 앱 작업 폴더의 권한과 model-settings.json 파일을 확인해 주세요.",
    )
}
