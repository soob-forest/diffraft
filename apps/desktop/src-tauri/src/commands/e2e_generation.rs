use crate::{claude_adapter::process::ProcessSpec, domain::error::AppError};
use std::{fs, path::PathBuf, time::Duration};

pub fn spec() -> Result<ProcessSpec, AppError> {
    let directory = PathBuf::from(
        std::env::var_os("DOCREVIEW_E2E_DATA")
            .ok_or_else(|| AppError::invalid("테스트 폴더가 없습니다."))?,
    );
    if !directory.is_absolute() || !directory.starts_with(std::env::temp_dir()) {
        return Err(AppError::invalid("테스트 임시 경로가 올바르지 않습니다."));
    }
    let control = directory.join("next-generation");
    let mode = fs::read_to_string(&control)
        .map_err(|_| AppError::invalid("다음 가짜 응답을 지정해 주세요."))?;
    if !matches!(
        mode.as_str(),
        "REGENERATE"
            | "PATCH"
            | "PATCH_SCOPE"
            | "REGENERATE_DELAY"
            | "REWRITE"
            | "REWRITE_DELAY"
            | "EXPLAIN"
            | "EXPLAIN_DELAY"
            | "EXPLAIN_CANCEL_RACE"
            | "EXPLAIN_CONTEXT"
            | "EXPLAIN_FRESH"
            | "SESSION_MISSING"
            | "STRUCTURED_LIMIT"
            | "MODEL_DENIED"
            | "malformed"
    ) {
        return Err(AppError::invalid("등록된 가짜 응답만 사용할 수 있습니다."));
    }
    fs::remove_file(control).map_err(|_| AppError::invalid("가짜 요청을 초기화할 수 없습니다."))?;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    Ok(ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-claude.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory,
        environment: Default::default(),
        timeout: Duration::from_secs(10),
    })
}
