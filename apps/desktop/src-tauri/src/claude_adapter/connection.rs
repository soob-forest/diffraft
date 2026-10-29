use super::{
    diagnostics, discovery,
    environment::{self, CliEnvironment},
    guarded_process,
    process::ProcessSpec,
    profile, result, settings,
};
use crate::domain::{
    ai::{AiResponse, ResponseMode},
    connection::{ConnectionReport, ConnectionStatus},
    document::validate_id,
    error::{AppError, ErrorCode},
};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

const GENERATION_TIMEOUT: Duration = Duration::from_secs(60);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const TEST_INPUT: &[u8] = br#"{"mode":"EXPLAIN","instruction":"Return a short connection acknowledgement. No document is provided."}"#;

pub struct PreparedCli {
    pub spec: ProcessSpec,
    pub version: String,
}

pub fn inspect(directory: &Path) -> Result<ConnectionReport, AppError> {
    let environment = environment::current()?;
    let Some(path) = locate(directory, &environment)? else {
        return Ok(profile::report(ConnectionStatus::Missing, None, None));
    };
    inspect_path(directory, &path, &environment)
}

pub fn select(directory: &Path, selected: &Path) -> Result<ConnectionReport, AppError> {
    let report = inspect_path(directory, selected, &environment::current()?)?;
    let path = report
        .executable
        .as_deref()
        .ok_or_else(|| AppError::invalid("공식 CLI 경로를 확인해 주세요."))?;
    settings::save(directory, Path::new(path))?;
    Ok(report)
}

pub fn prepared(
    directory: &Path,
    task: &str,
    mode: ResponseMode,
    session: Option<&str>,
    model: crate::domain::model::ModelSelection,
) -> Result<PreparedCli, AppError> {
    validate_id(task)?;
    let environment = environment::current()?;
    let report = inspect_with(directory, &environment)?;
    require_ready(&report)?;
    let workspace = settings::private_directory(directory, "cli-sessions")?;
    let spec = ProcessSpec {
        program: PathBuf::from(report.executable.ok_or_else(missing)?),
        args: profile::model_arguments(mode, session, model)?,
        directory: settings::private_directory(&workspace, task)?,
        environment: environment.values,
        timeout: GENERATION_TIMEOUT,
    };
    Ok(PreparedCli {
        spec,
        version: report.version.ok_or_else(missing)?,
    })
}

pub fn test(
    directory: &Path,
    operation: &str,
    cancelled: Arc<AtomicBool>,
) -> Result<ConnectionReport, AppError> {
    let model = super::model_settings::load(directory)?;
    let PreparedCli { spec, version } =
        prepared(directory, operation, ResponseMode::Explain, None, model)?;
    let output = guarded_process::run(&spec, TEST_INPUT, cancelled, directory)?;
    if !matches!(result::response(&output)?, AiResponse::Explain { .. }) {
        return Err(AppError::new(
            ErrorCode::OutputInvalid,
            "연결 테스트 응답 모드가 올바르지 않습니다.",
        ));
    }
    let mut report = profile::report(
        ConnectionStatus::Ready,
        Some(spec.program.to_string_lossy().into_owned()),
        Some(version),
    );
    report.tested_model = Some(model);
    report.message =
        "연결 테스트에 성공했습니다. 문서를 전송하지 않은 최소 요청과 응답 검증을 완료했습니다."
            .into();
    Ok(report)
}

pub fn login(directory: &Path, cancelled: Arc<AtomicBool>) -> Result<ConnectionReport, AppError> {
    let environment = environment::current()?;
    let report = inspect_with(directory, &environment)?;
    if environment.overridden
        || matches!(
            report.status,
            ConnectionStatus::Unsupported
                | ConnectionStatus::DiagnosticFailed
                | ConnectionStatus::Missing
        )
    {
        return Err(AppError::new(ErrorCode::CliUnsupported, &report.message));
    }
    let spec = ProcessSpec {
        program: report.executable.ok_or_else(missing)?.into(),
        args: vec!["auth".into(), "login".into()],
        directory: settings::private_directory(directory, "cli-diagnostics")?,
        environment: environment.values,
        timeout: LOGIN_TIMEOUT,
    };
    let output = guarded_process::run(&spec, b"", cancelled, directory)?;
    if !output.status.success() {
        return Err(AppError::new(
            ErrorCode::AuthRequired,
            "공식 CLI 로그인을 완료하지 못했습니다. 터미널에서 claude auth login을 실행한 뒤 상태를 다시 확인해 주세요.",
        ));
    }
    inspect(directory)
}

fn inspect_with(
    directory: &Path,
    environment: &CliEnvironment,
) -> Result<ConnectionReport, AppError> {
    let path = locate(directory, environment)?.ok_or_else(missing)?;
    inspect_path(directory, &path, environment)
}
fn inspect_path(
    directory: &Path,
    path: &Path,
    environment: &CliEnvironment,
) -> Result<ConnectionReport, AppError> {
    let cwd = settings::private_directory(directory, "cli-diagnostics")?;
    diagnostics::inspect(path, &cwd, environment)
}
fn locate(directory: &Path, environment: &CliEnvironment) -> Result<Option<PathBuf>, AppError> {
    if let Some(path) = settings::load(directory)? {
        return Ok(Some(path));
    }
    let home = Path::new(&environment.values[&OsString::from("HOME")]);
    Ok(
        discovery::candidates(home, std::env::var_os("PATH").as_deref())
            .into_iter()
            .find(|path| path.exists()),
    )
}
fn require_ready(report: &ConnectionReport) -> Result<(), AppError> {
    if report.status == ConnectionStatus::Ready {
        return Ok(());
    }
    let code = match report.status {
        ConnectionStatus::AuthRequired | ConnectionStatus::AuthRouteMismatch => {
            ErrorCode::AuthRequired
        }
        _ => ErrorCode::CliUnsupported,
    };
    Err(AppError::new(code, &report.message))
}
fn missing() -> AppError {
    AppError::new(
        ErrorCode::CliUnsupported,
        "공식 Claude Code 설치 경로를 확인해 주세요.",
    )
}
