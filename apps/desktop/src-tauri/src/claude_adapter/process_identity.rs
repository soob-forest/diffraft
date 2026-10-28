use crate::domain::error::{AppError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::{
    io,
    mem::{MaybeUninit, size_of},
    ptr,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ProcessIdentity {
    pub pid: u32,
    pub group: u32,
    pub user: u32,
    pub started: (u64, u64),
}

pub(super) fn process(pid: u32) -> Result<Option<ProcessIdentity>, AppError> {
    let pid = i32::try_from(pid).map_err(|_| uncertain())?;
    if pid <= 1 {
        return Err(uncertain());
    }
    let mut info = MaybeUninit::<libc::proc_bsdinfo>::uninit();
    // proc_pidinfo writes at most the supplied buffer and returns the written size.
    let count = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            info.as_mut_ptr().cast(),
            size_of::<libc::proc_bsdinfo>() as i32,
        )
    };
    if count == 0 && io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
        return Ok(None);
    }
    if count != size_of::<libc::proc_bsdinfo>() as i32 {
        return Err(uncertain());
    }
    // All fields are initialized only after an exact-size kernel response.
    let info = unsafe { info.assume_init() };
    Ok(Some(ProcessIdentity {
        pid: info.pbi_pid,
        group: info.pbi_pgid,
        user: info.pbi_uid,
        started: (info.pbi_start_tvsec, info.pbi_start_tvusec),
    }))
}

pub(super) fn boot() -> Result<String, AppError> {
    const BOOT_UUID_BUFFER: usize = 64;
    let mut value = [0u8; BOOT_UUID_BUFFER];
    let mut size = value.len();
    // The boot session UUID remains stable across wall-clock corrections.
    let result = unsafe {
        libc::sysctlbyname(
            c"kern.bootsessionuuid".as_ptr(),
            value.as_mut_ptr().cast(),
            &mut size,
            ptr::null_mut(),
            0,
        )
    };
    if result != 0 || size == 0 || size > value.len() {
        return Err(uncertain());
    }
    let value = std::ffi::CStr::from_bytes_with_nul(&value[..size]).map_err(|_| uncertain())?;
    let value =
        uuid::Uuid::parse_str(value.to_str().map_err(|_| uncertain())?).map_err(|_| uncertain())?;
    if value.is_nil() {
        return Err(uncertain());
    }
    Ok(value.to_string())
}

pub(super) fn owned_group(identity: &ProcessIdentity) -> bool {
    identity.pid > 1
        && identity.pid == identity.group
        && identity.user == unsafe { libc::geteuid() }
        && identity.pid != std::process::id()
}

pub(super) fn uncertain() -> AppError {
    AppError::new(
        ErrorCode::Busy,
        "이전 CLI의 종료를 확인할 수 없어 새 생성을 차단했습니다. 로컬 편집은 계속할 수 있습니다. 앱을 다시 실행해 확인하거나 Mac 재시작 후 다시 요청해 주세요.",
    )
}
