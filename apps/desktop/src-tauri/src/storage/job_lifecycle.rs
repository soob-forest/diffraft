use super::{Store, errors::database_error};
use crate::domain::{
    document::validate_id,
    error::{AppError, ErrorCode},
    review::ReviewJob,
};
use rusqlite::{Connection, OptionalExtension, params};

pub(super) fn require_running(connection: &Connection, job: &ReviewJob) -> Result<(), AppError> {
    validate_id(&job.id)?;
    validate_id(&job.attempt_id)?;
    let status: Option<String> = connection
        .query_row(
            "SELECT status FROM jobs WHERE id=?1 AND attempt_id=?2",
            params![job.id, job.attempt_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    if status.as_deref() != Some("RUNNING") {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "활성 요청이 아니므로 결과를 등록하지 않았습니다.",
        ));
    }
    Ok(())
}

impl Store {
    pub fn cancel_generation(&self, operation: &str) -> Result<(), AppError> {
        validate_id(operation)?;
        self.connection()?.execute(
            "UPDATE jobs SET status='CANCELLING' WHERE id=?1 AND status IN ('CREATED','RUNNING')",
            [operation],
        ).map_err(database_error)?;
        Ok(())
    }

    pub fn finish_failed_job(&self, job: &ReviewJob, error: ErrorCode) -> Result<(), AppError> {
        validate_id(&job.id)?;
        validate_id(&job.attempt_id)?;
        let status = if error == ErrorCode::Cancelled {
            "CANCELLED"
        } else {
            "FAILED"
        };
        let code = serde_json::to_value(error)
            .map_err(|_| AppError::invalid("오류 상태를 저장할 수 없습니다."))?;
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let changed = transaction.execute(
            "UPDATE jobs SET status=?1,error_code=?2 WHERE id=?3 AND attempt_id=?4 AND status IN ('CREATED','RUNNING','CANCELLING')",
            params![status,code.as_str(),job.id,job.attempt_id],
        ).map_err(database_error)?;
        if changed == 1 && error == ErrorCode::SessionMissing {
            transaction.execute("UPDATE session_bindings SET status='MISSING' WHERE status='ACTIVE' AND task_id=(SELECT task_id FROM jobs WHERE id=?1) AND cli_session_id=(SELECT requested_session_id FROM job_executions WHERE job_id=?1)", [&job.id]).map_err(database_error)?;
        }
        transaction.commit().map_err(database_error)
    }

    pub(super) fn recover_jobs(&self) -> Result<(), AppError> {
        self.connection()?.execute(
            "UPDATE jobs SET status='FAILED',error_code='CANCELLED' WHERE status IN ('CREATED','RUNNING','CANCELLING')", [],
        ).map_err(database_error)?;
        Ok(())
    }
}
