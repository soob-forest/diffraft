use crate::domain::error::AppError;
use std::{fs, path::PathBuf};

pub fn destination() -> Result<Option<PathBuf>, AppError> {
    let root = PathBuf::from(
        std::env::var_os("DOCREVIEW_E2E_DATA")
            .ok_or_else(|| AppError::invalid("테스트 폴더가 없습니다."))?,
    );
    if !root.is_absolute() || !root.starts_with(std::env::temp_dir()) {
        return Err(AppError::invalid("테스트 임시 경로가 올바르지 않습니다."));
    }
    let control = root.join("next-export");
    let name = fs::read_to_string(&control)
        .map_err(|_| AppError::invalid("다음 내보내기 파일을 지정해 주세요."))?;
    if !matches!(
        name.as_str(),
        "export-copy" | "export-working" | "export-existing" | "cancel"
    ) {
        return Err(AppError::invalid(
            "등록된 내보내기 이름만 선택할 수 있습니다.",
        ));
    }
    fs::remove_file(control)
        .map_err(|_| AppError::invalid("테스트 선택을 초기화할 수 없습니다."))?;
    Ok((name != "cancel").then(|| root.join(format!("{name}.md"))))
}
