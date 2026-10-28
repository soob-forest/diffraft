use super::errors::file_error;
use crate::domain::error::{AppError, ErrorCode};
use std::{
    fs::{File, OpenOptions, TryLockError},
    os::unix::fs::OpenOptionsExt,
    path::Path,
};

pub(super) struct WriterLock(File);

impl WriterLock {
    pub(super) fn acquire(directory: &Path) -> Result<Self, AppError> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(directory.join("writer.lock"))
            .map_err(file_error)?;
        file.try_lock().map_err(|error| match error {
            TryLockError::WouldBlock => AppError::new(
                ErrorCode::Busy,
                "이 작업 공간은 다른 DocReview에서 사용 중입니다. 다른 창을 종료해 주세요.",
            ),
            TryLockError::Error(error) => file_error(error),
        })?;
        Ok(Self(file))
    }

    #[cfg(test)]
    pub(super) fn inherited_handle(&self) -> std::io::Result<File> {
        self.0.try_clone()
    }
}

impl Drop for WriterLock {
    fn drop(&mut self) {
        if let Err(error) = self.0.unlock() {
            eprintln!(
                "{}",
                serde_json::json!({
                    "event": "writer_unlock_failed", "osCode": error.raw_os_error()
                })
            );
        }
    }
}
