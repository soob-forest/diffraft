use super::{
    environment::CliEnvironment,
    process::{ProcessSpec, run},
    profile::MAX_PATH_BYTES,
};
use crate::domain::error::{AppError, ErrorCode};
use std::{
    ffi::OsString,
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

const SIGNATURE_REQUIREMENT: &str = "=identifier \"com.anthropic.claude-code\" and anchor apple generic and certificate leaf[subject.OU] = \"Q6L2SF6YDW\"";
pub const DIAGNOSTIC_TIMEOUT: Duration = Duration::from_secs(10);

pub fn candidates(home: &Path, search: Option<&std::ffi::OsStr>) -> Vec<PathBuf> {
    let mut paths = vec![
        home.join(".local/bin/claude"),
        "/opt/homebrew/bin/claude".into(),
        "/usr/local/bin/claude".into(),
    ];
    if let Some(search) = search {
        paths.extend(
            std::env::split_paths(search)
                .filter(|path| path.is_absolute())
                .map(|path| path.join("claude")),
        );
    }
    paths.dedup();
    paths
}

pub fn executable(path: &Path) -> Result<PathBuf, AppError> {
    if !path.is_absolute() || path.as_os_str().len() > MAX_PATH_BYTES {
        return Err(unsupported());
    }
    let path = fs::canonicalize(path).map_err(|_| unsupported())?;
    let metadata = fs::metadata(&path).map_err(|_| unsupported())?;
    if !metadata.is_file() || metadata.permissions().mode() & 0o111 == 0 || path.to_str().is_none()
    {
        return Err(unsupported());
    }
    Ok(path)
}

pub fn verify_signature(
    program: &Path,
    directory: &Path,
    environment: &CliEnvironment,
) -> Result<(), AppError> {
    let spec = ProcessSpec {
        program: "/usr/bin/codesign".into(),
        args: [
            OsString::from("--verify"),
            "--strict".into(),
            "-R".into(),
            SIGNATURE_REQUIREMENT.into(),
            program.as_os_str().into(),
        ]
        .into(),
        directory: directory.into(),
        environment: environment.values.clone(),
        timeout: DIAGNOSTIC_TIMEOUT,
    };
    let output = run(&spec, b"", Arc::new(AtomicBool::new(false)))?;
    if !output.status.success() {
        return Err(unsupported());
    }
    Ok(())
}

fn unsupported() -> AppError {
    AppError::new(
        ErrorCode::CliUnsupported,
        "공식 서명된 Claude Code native 실행 파일을 확인할 수 없습니다. 공식 설치 경로를 선택해 주세요.",
    )
}
