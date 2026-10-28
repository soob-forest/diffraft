use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::error::{AppError, ErrorCode};

pub trait Runtime: Send + Sync {
    fn id(&self) -> String;
    fn now_ms(&self) -> Result<i64, AppError>;
}

pub struct SystemRuntime;

impl Runtime for SystemRuntime {
    fn id(&self) -> String {
        uuid::Uuid::new_v4().to_string()
    }

    fn now_ms(&self) -> Result<i64, AppError> {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| AppError::new(ErrorCode::SaveFailed, "시스템 시각을 확인해 주세요."))?;
        i64::try_from(duration.as_millis()).map_err(|_| {
            AppError::new(
                ErrorCode::SaveFailed,
                "시스템 시각이 지원 범위를 벗어났습니다.",
            )
        })
    }
}
