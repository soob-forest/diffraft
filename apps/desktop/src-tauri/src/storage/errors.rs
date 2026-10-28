use crate::domain::error::{AppError, ErrorCode};

pub fn database_error(error: rusqlite::Error) -> AppError {
    let message = match error {
        rusqlite::Error::SqliteFailure(code, _) if code.code == rusqlite::ErrorCode::DiskFull => {
            "저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요."
        }
        rusqlite::Error::SqliteFailure(code, _)
            if matches!(
                code.code,
                rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked
            ) =>
        {
            "작업 기록이 사용 중입니다. 다른 DocReview 창을 종료해 주세요."
        }
        _ => "작업 기록을 저장할 수 없습니다. 앱을 다시 실행해 복구 상태를 확인해 주세요.",
    };
    AppError::new(ErrorCode::SaveFailed, message)
}

pub fn file_error(error: std::io::Error) -> AppError {
    let message = match error.kind() {
        std::io::ErrorKind::PermissionDenied => {
            "파일 접근 권한이 없습니다. 권한을 확인하거나 사본으로 저장해 주세요."
        }
        std::io::ErrorKind::StorageFull => {
            "저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요."
        }
        std::io::ErrorKind::NotFound => {
            "작업 파일을 찾을 수 없습니다. 파일 위치를 확인하거나 사본으로 저장해 주세요."
        }
        std::io::ErrorKind::AlreadyExists => {
            "이미 존재하는 파일입니다. 다른 파일 이름을 선택해 주세요."
        }
        _ => "파일을 저장할 수 없습니다. 내용을 유지한 채 다시 시도하거나 사본으로 저장해 주세요.",
    };
    AppError::new(ErrorCode::SaveFailed, message)
}

pub fn conflict() -> AppError {
    AppError::new(
        ErrorCode::FileConflict,
        "파일이 외부에서 변경되었거나 복구가 필요합니다. 양쪽 내용을 비교한 뒤 해결해 주세요.",
    )
}

pub fn lock_error() -> AppError {
    AppError::new(
        ErrorCode::SaveFailed,
        "저장 작업의 내부 상태를 복구해야 합니다. 앱을 다시 실행해 주세요.",
    )
}
