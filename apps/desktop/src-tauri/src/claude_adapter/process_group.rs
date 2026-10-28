use crate::domain::error::{AppError, ErrorCode};
use std::{
    io, thread,
    time::{Duration, Instant},
};

const GRACE: Duration = Duration::from_millis(250);
const CLEANUP_LIMIT: Duration = Duration::from_secs(2);
const POLL: Duration = Duration::from_millis(20);

fn signal(pid: u32, signal: i32) -> Result<bool, AppError> {
    let pid = i32::try_from(pid).map_err(|_| cleanup_error())?;
    if pid <= 1 {
        return Err(cleanup_error());
    }
    // Child is spawned into its own process group; never signal the app's group.
    if unsafe { libc::kill(-pid, signal) } == 0 {
        return Ok(true);
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        return Ok(false);
    }
    Err(cleanup_error())
}

pub(super) fn terminate(pid: u32) -> Result<(), AppError> {
    if !signal(pid, libc::SIGTERM)? {
        return Ok(());
    }
    thread::sleep(GRACE);
    signal(pid, libc::SIGKILL)?;
    Ok(())
}

pub(super) fn verify_stopped(pid: u32) -> Result<(), AppError> {
    let deadline = Instant::now() + CLEANUP_LIMIT;
    while signal(pid, 0)? {
        if Instant::now() >= deadline {
            return Err(cleanup_error());
        }
        thread::sleep(POLL);
    }
    Ok(())
}

fn cleanup_error() -> AppError {
    AppError::new(
        ErrorCode::Busy,
        "CLI 종료를 확인하지 못했습니다. 새 요청 전에 앱을 다시 시작해 주세요.",
    )
}
