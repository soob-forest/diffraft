use super::{pipes, process_group};
use crate::domain::{
    MAX_CONTEXT_BYTES, MAX_RESPONSE_BYTES,
    error::{AppError, ErrorCode},
};
use std::{
    collections::BTreeMap,
    ffi::OsString,
    os::unix::process::CommandExt,
    path::PathBuf,
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

const POLL: Duration = Duration::from_millis(20);
const REAP_LIMIT: Duration = Duration::from_secs(2);
#[derive(Clone)]
pub struct ProcessSpec {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub directory: PathBuf,
    pub environment: BTreeMap<OsString, OsString>,
    pub timeout: Duration,
}
pub struct ProcessOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}
pub(super) struct ProcessCompletion {
    pub result: Result<ProcessOutput, AppError>,
    pub stopped: bool,
}

pub fn run(
    spec: &ProcessSpec,
    input: &[u8],
    cancelled: Arc<AtomicBool>,
) -> Result<ProcessOutput, AppError> {
    validate(spec, input, &cancelled)?;
    let child = spawn(spec)?;
    run_child(spec, input, cancelled, child).result
}

pub(super) fn run_child(
    spec: &ProcessSpec,
    input: &[u8],
    cancelled: Arc<AtomicBool>,
    mut child: Child,
) -> ProcessCompletion {
    let size = Arc::new(AtomicUsize::new(0));
    let done = Arc::new(AtomicBool::new(false));
    let output = pipes::reader(
        child.stdout.take().expect("piped stdout"),
        size.clone(),
        done.clone(),
    );
    let errors = pipes::reader(
        child.stderr.take().expect("piped stderr"),
        size.clone(),
        done.clone(),
    );
    let writer = pipes::writer(
        child.stdin.take().expect("piped stdin"),
        input.to_vec(),
        done.clone(),
    );
    let status = wait(&mut child, spec.timeout, &cancelled, &size);
    let cleanup = stop(&mut child);
    let stopped = cleanup.is_ok();
    done.store(true, Ordering::SeqCst);
    let results = (
        pipes::join(writer),
        pipes::join(output),
        pipes::join(errors),
    );
    ProcessCompletion {
        result: cleanup.and_then(|_| finish_output(status, size.load(Ordering::SeqCst), results)),
        stopped,
    }
}

type PipeResults = (
    Result<(), AppError>,
    Result<Vec<u8>, AppError>,
    Result<Vec<u8>, AppError>,
);
fn finish_output(
    status: Result<ExitStatus, AppError>,
    size: usize,
    results: PipeResults,
) -> Result<ProcessOutput, AppError> {
    let status = status?;
    if size > MAX_RESPONSE_BYTES {
        return Err(output_error());
    }
    results.0?;
    Ok(ProcessOutput {
        status,
        stdout: results.1?,
        stderr: results.2?,
    })
}

pub(super) fn validate(
    spec: &ProcessSpec,
    input: &[u8],
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    if !spec.program.is_absolute() || !spec.directory.is_absolute() || spec.timeout.is_zero() {
        return Err(AppError::invalid(
            "CLI 경로 또는 실행 제한이 올바르지 않습니다.",
        ));
    }
    if input.len() > MAX_CONTEXT_BYTES {
        return Err(AppError::new(
            ErrorCode::ContextTooLarge,
            "요청 문맥이 200 KiB를 초과했습니다. 범위를 줄여 주세요.",
        ));
    }
    if cancelled.load(Ordering::SeqCst) {
        return Err(cancelled_error());
    }
    Ok(())
}

pub(super) fn spawn(spec: &ProcessSpec) -> Result<Child, AppError> {
    Command::new(&spec.program)
        .args(&spec.args)
        .current_dir(&spec.directory)
        .env_clear()
        .envs(&spec.environment)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|_| {
            AppError::new(
                ErrorCode::CliUnsupported,
                "CLI를 실행할 수 없습니다. 설치 경로와 실행 권한을 확인해 주세요.",
            )
        })
}

pub(super) fn stop(child: &mut Child) -> Result<(), AppError> {
    let signalled = process_group::terminate(child.id());
    let deadline = Instant::now() + REAP_LIMIT;
    while child.try_wait().map_err(|_| wait_error())?.is_none() {
        if Instant::now() >= deadline {
            return Err(signalled.err().unwrap_or_else(wait_error));
        }
        thread::sleep(POLL);
    }
    // Darwin may return EPERM when signalling an already-dead, unreaped group.
    // Reaping the owned child and proving the group absent are authoritative.
    process_group::verify_stopped(child.id())
}

fn wait(
    child: &mut Child,
    timeout: Duration,
    cancelled: &AtomicBool,
    size: &AtomicUsize,
) -> Result<ExitStatus, AppError> {
    let deadline = Instant::now() + timeout;
    loop {
        if cancelled.load(Ordering::SeqCst) {
            return Err(cancelled_error());
        }
        if size.load(Ordering::SeqCst) > MAX_RESPONSE_BYTES {
            return Err(output_error());
        }
        if let Some(status) = child.try_wait().map_err(|_| wait_error())? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            return Err(AppError::new(
                ErrorCode::NetworkError,
                "CLI 응답 대기 시간이 초과되었습니다. 연결을 확인하고 다시 요청해 주세요.",
            ));
        }
        thread::sleep(POLL);
    }
}
fn output_error() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "CLI 출력이 2 MiB를 초과하여 요청을 중단했습니다.",
    )
}
fn cancelled_error() -> AppError {
    AppError::new(
        ErrorCode::Cancelled,
        "요청을 중단했습니다. 이전 후보를 유지했습니다.",
    )
}
fn wait_error() -> AppError {
    AppError::new(
        ErrorCode::UnknownError,
        "CLI 종료 상태를 확인할 수 없습니다.",
    )
}
