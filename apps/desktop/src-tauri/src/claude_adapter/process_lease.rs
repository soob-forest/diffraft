use super::{
    process_group,
    process_identity::{self, ProcessIdentity, uncertain},
};
use crate::{
    domain::{document::validate_id, error::AppError},
    storage::files,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
};

const RECORD_NAME: &str = "cli-process.json";
const MAX_RECORD_BYTES: usize = 4096;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    token: String,
    boot: String,
    process: Option<ProcessIdentity>,
}
pub(super) struct ProcessLease {
    path: PathBuf,
    record: Record,
}

impl ProcessLease {
    pub(super) fn reserve(directory: &Path) -> Result<Self, AppError> {
        let path = directory.join(RECORD_NAME);
        let record = Record {
            token: uuid::Uuid::new_v4().to_string(),
            boot: process_identity::boot()?,
            process: None,
        };
        write_record(&path, &record, true)?;
        Ok(Self { path, record })
    }

    pub(super) fn attach(&mut self, pid: u32) -> Result<(), AppError> {
        let identity = process_identity::process(pid)?.ok_or_else(uncertain)?;
        if !process_identity::owned_group(&identity) {
            return Err(uncertain());
        }
        self.check_token()?;
        self.record.process = Some(identity);
        write_record(&self.path, &self.record, false)
    }

    pub(super) fn release(self) -> Result<(), AppError> {
        self.check_token()?;
        remove_record(&self.path)
    }

    fn check_token(&self) -> Result<(), AppError> {
        let record = read_record(&self.path)?.ok_or_else(uncertain)?;
        if record.token != self.record.token {
            return Err(uncertain());
        }
        Ok(())
    }
}

pub fn recover(directory: &Path) -> Result<(), AppError> {
    let path = directory.join(RECORD_NAME);
    let Some(record) = read_record(&path)? else {
        return Ok(());
    };
    if record.boot != process_identity::boot()? {
        return remove_record(&path);
    }
    let saved = record.process.ok_or_else(uncertain)?;
    if !process_identity::owned_group(&saved) {
        return Err(uncertain());
    }
    match process_identity::process(saved.pid)? {
        Some(current) if current == saved => {
            process_group::terminate(saved.pid)?;
            process_group::verify_stopped(saved.pid)?;
        }
        None => process_group::verify_stopped(saved.pid)?,
        Some(_) => return Err(uncertain()),
    }
    remove_record(&path)
}

pub fn require_clear(directory: &Path) -> Result<(), AppError> {
    match fs::symlink_metadata(directory.join(RECORD_NAME)) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(uncertain()),
    }
}

fn read_record(path: &Path) -> Result<Option<Record>, AppError> {
    let file = match OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(uncertain()),
    };
    if !file.metadata().map_err(|_| uncertain())?.is_file() {
        return Err(uncertain());
    }
    let mut bytes = Vec::new();
    file.take((MAX_RECORD_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| uncertain())?;
    if bytes.len() > MAX_RECORD_BYTES {
        return Err(uncertain());
    }
    let record: Record = serde_json::from_slice(&bytes).map_err(|_| uncertain())?;
    validate_id(&record.token).map_err(|_| uncertain())?;
    validate_id(&record.boot).map_err(|_| uncertain())?;
    Ok(Some(record))
}

fn write_record(path: &Path, record: &Record, exclusive: bool) -> Result<(), AppError> {
    let directory = path.parent().ok_or_else(uncertain)?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|_| uncertain())?;
    let bytes = serde_json::to_vec(record).map_err(|_| uncertain())?;
    temp.write_all(&bytes).map_err(|_| uncertain())?;
    files::sync_file(temp.as_file())?;
    if exclusive {
        temp.persist_noclobber(path).map_err(|_| uncertain())?;
    } else {
        temp.persist(path).map_err(|_| uncertain())?;
    }
    files::sync_directory(directory)
}

fn remove_record(path: &Path) -> Result<(), AppError> {
    fs::remove_file(path).map_err(|_| uncertain())?;
    files::sync_directory(path.parent().ok_or_else(uncertain)?)
}
