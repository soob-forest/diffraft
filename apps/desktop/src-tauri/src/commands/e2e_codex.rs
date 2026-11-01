use crate::{
    claude_adapter::{execution::CliLauncher, process::ProcessSpec},
    domain::error::AppError,
    storage::Store,
};
use std::{fs, path::PathBuf, time::Duration};

pub fn use_real() -> bool {
    std::env::var_os("DOCREVIEW_E2E_DATA")
        .map(PathBuf::from)
        .is_some_and(|path| {
            path.is_absolute()
                && path.starts_with(std::env::temp_dir())
                && path.join("use-real-codex").is_file()
        })
}

fn fixture(store: &Store, task: &str, mode: &str) -> Result<ProcessSpec, AppError> {
    if !matches!(
        mode,
        "SUCCESS"
            | "AUTH_REQUIRED"
            | "LIMIT"
            | "MALFORMED"
            | "WRONG_THREAD"
            | "TOOL"
            | "ACCOUNT_CHANGED"
            | "SESSION_MISSING"
            | "RESUME_DENIED"
            | "RECOVERY_SUCCESS"
            | "HANG"
    ) {
        return Err(AppError::invalid(
            "등록된 Codex fixture만 사용할 수 있습니다.",
        ));
    }
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    Ok(ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-codex.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: crate::codex_adapter::launch::workspace(store.directory(), task)?,
        environment: std::collections::BTreeMap::from([(
            "HOME".into(),
            store.directory().as_os_str().to_owned(),
        )]),
        timeout: Duration::from_secs(10),
    })
}

pub fn diagnostic(store: &Store, task: &str) -> Result<(ProcessSpec, String), AppError> {
    let root = store
        .directory()
        .parent()
        .ok_or_else(|| AppError::invalid("테스트 폴더가 없습니다."))?;
    let mode = match fs::read_to_string(root.join("next-codex-connection")) {
        Ok(mode) => mode,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "SUCCESS".into(),
        Err(_) => return Err(AppError::invalid("Codex fixture를 읽을 수 없습니다.")),
    };
    Ok((fixture(store, task, &mode)?, "fixture".into()))
}

pub fn generation(store: &Store, task: &str) -> Result<CliLauncher, AppError> {
    if use_real() {
        return Ok(CliLauncher::Installed);
    }
    let root = store
        .directory()
        .parent()
        .ok_or_else(|| AppError::invalid("테스트 폴더가 없습니다."))?;
    let path = root.join("next-generation");
    let mode = fs::read_to_string(&path)
        .map_err(|_| AppError::invalid("다음 Codex fixture를 지정해 주세요."))?;
    let mode = mode
        .strip_prefix("CODEX_")
        .ok_or_else(|| AppError::invalid("Codex fixture가 필요합니다."))?;
    let spec = fixture(store, task, mode)?;
    fs::remove_file(path)
        .map_err(|_| AppError::invalid("Codex fixture를 초기화할 수 없습니다."))?;
    Ok(CliLauncher::CodexFixture(spec))
}
