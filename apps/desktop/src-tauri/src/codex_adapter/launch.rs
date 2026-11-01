use crate::{
    claude_adapter::{guarded_process, process::ProcessSpec},
    domain::{
        ai_settings::validate_path,
        document::validate_id,
        error::{AppError, ErrorCode},
    },
    storage::Store,
};
use std::{
    collections::BTreeMap,
    ffi::OsString,
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

pub const MINIMUM_VERSION: &str = "0.165.0";
const TIMEOUT: Duration = Duration::from_secs(120);

pub fn prepare(
    store: &Store,
    task: &str,
    cancelled: Arc<AtomicBool>,
) -> Result<(ProcessSpec, String), AppError> {
    #[cfg(feature = "e2e")]
    if std::env::var_os("DOCREVIEW_E2E_DATA").is_some() && !crate::commands::e2e_codex::use_real() {
        return crate::commands::e2e_codex::diagnostic(store, task);
    }
    let directory = workspace(store.directory(), task)?;
    let prefs = store.ai_preferences()?;
    let program = resolve(prefs.codex_path.as_deref())?;
    let environment = environment()?;
    let mut spec = ProcessSpec {
        program,
        args: vec!["--version".into()],
        directory,
        environment,
        timeout: Duration::from_secs(5),
    };
    let output = guarded_process::run(&spec, b"", cancelled, store.directory())?;
    let version = std::str::from_utf8(&output.stdout)
        .ok()
        .and_then(|v| v.trim().strip_prefix("codex-cli "))
        .filter(|v| supported(v))
        .ok_or_else(unsupported)?;
    if !output.status.success() {
        return Err(unsupported());
    }
    let version = version.to_owned();
    spec.args.clear();
    spec.timeout = TIMEOUT;
    Ok((spec, version))
}

pub fn workspace(directory: &Path, task: &str) -> Result<PathBuf, AppError> {
    validate_id(task)?;
    let mut current = directory.to_owned();
    for component in ["codex-work", task] {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) if !meta.is_dir() || meta.file_type().is_symlink() => {
                return Err(unsupported());
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|_| unsupported())?
            }
            Err(_) => return Err(unsupported()),
        }
        fs::set_permissions(&current, fs::Permissions::from_mode(0o700))
            .map_err(|_| unsupported())?;
    }
    fs::canonicalize(current).map_err(|_| unsupported())
}

pub fn supported(version: &str) -> bool {
    numbers(version).is_some_and(|v| v >= numbers(MINIMUM_VERSION).expect("minimum version"))
}
fn numbers(version: &str) -> Option<[u32; 3]> {
    let values: Vec<_> = version.split('.').collect();
    if values.len() != 3 {
        return None;
    }
    let mut result = [0; 3];
    for (index, value) in values.iter().enumerate() {
        if value.is_empty()
            || !value.bytes().all(|b| b.is_ascii_digit())
            || value.len() > 1 && value.starts_with('0')
        {
            return None;
        }
        result[index] = value.parse().ok()?;
    }
    Some(result)
}

fn resolve(selected: Option<&str>) -> Result<PathBuf, AppError> {
    if let Some(path) = selected {
        validate_path(path)?;
        return executable(Path::new(path)).ok_or_else(unsupported);
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(unsupported)?;
    [
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
        home.join(".local/bin/codex"),
    ]
    .iter()
    .find_map(|path| executable(path))
    .ok_or_else(|| {
        AppError::new(
            ErrorCode::CliUnsupported,
            "Codex를 찾을 수 없습니다. 공식 CLI를 설치하거나 실행 파일 경로를 선택해 주세요.",
        )
    })
}
fn executable(path: &Path) -> Option<PathBuf> {
    let path = fs::canonicalize(path).ok()?;
    let meta = path.metadata().ok()?;
    (path.is_absolute() && meta.is_file() && meta.permissions().mode() & 0o111 != 0).then_some(path)
}
fn environment() -> Result<BTreeMap<OsString, OsString>, AppError> {
    for key in [
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "CHATGPT_BASE_URL",
        "CODEX_API_KEY",
    ] {
        if std::env::var_os(key).is_some() {
            return Err(AppError::new(
                ErrorCode::AuthRequired,
                "Codex의 API 키 또는 인증 경로 환경변수가 설정되어 있습니다. ChatGPT 인증 경로를 확인해 주세요.",
            ));
        }
    }
    Ok(["HOME", "PATH", "CODEX_HOME", "TMPDIR", "LANG"]
        .into_iter()
        .filter_map(|key| std::env::var_os(key).map(|value| (key.into(), value)))
        .collect())
}
fn unsupported() -> AppError {
    AppError::new(
        ErrorCode::CliUnsupported,
        "필수 기능을 지원하는 공식 Codex 0.165.0 이상이 필요합니다. 실행 경로와 권한을 확인해 주세요.",
    )
}
