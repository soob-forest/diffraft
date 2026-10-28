use super::{
    Store,
    errors::database_error,
    generation_messages,
    generation_models::{ExecutionContext, SessionBinding, mode_name},
    job_lifecycle::require_running,
};
use crate::domain::{document::validate_id, error::AppError, review::ReviewJob};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

const MAX_CWD_BYTES: usize = 4096;
const MAX_CLI_VERSION_BYTES: usize = 64;

impl Store {
    pub fn active_session(&self, task: &str) -> Result<Option<SessionBinding>, AppError> {
        validate_id(task)?;
        active_session(&*self.connection()?, task)
    }

    pub fn job_task(&self, job: &ReviewJob) -> Result<String, AppError> {
        validate_id(&job.id)?;
        validate_id(&job.attempt_id)?;
        task(&*self.connection()?, job)
    }

    pub fn record_execution(
        &self,
        job: &ReviewJob,
        execution: &ExecutionContext,
    ) -> Result<(), AppError> {
        validate(execution)?;
        let mut connection = self.connection()?;
        require_running(&connection, job)?;
        let task_id = task(&connection, job)?;
        verify_session(&connection, &task_id, execution)?;
        verify_retry(&connection, &task_id, execution.retry_of.as_deref())?;
        let instruction = generation_messages::instruction(&connection, job)?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO job_executions(job_id,mode,requested_session_id,cwd,cli_version,retry_of) VALUES(?1,?2,?3,?4,?5,?6)", params![job.id,mode_name(execution.mode),execution.requested_session_id,execution.cwd,execution.cli_version,execution.retry_of]).map_err(database_error)?;
        self.insert_generation_message(&transaction, job, "USER", &instruction)?;
        transaction.commit().map_err(database_error)
    }
}

pub(super) fn task(connection: &Connection, job: &ReviewJob) -> Result<String, AppError> {
    connection
        .query_row(
            "SELECT task_id FROM jobs WHERE id=?1 AND attempt_id=?2",
            params![job.id, job.attempt_id],
            |row| row.get(0),
        )
        .map_err(database_error)
}

pub(super) fn active_session(
    connection: &Connection,
    task: &str,
) -> Result<Option<SessionBinding>, AppError> {
    connection.query_row("SELECT cli_session_id,cwd,cli_version FROM session_bindings WHERE task_id=?1 AND status='ACTIVE'", [task], |row| Ok(SessionBinding {session_id: row.get(0)?,cwd: row.get(1)?,cli_version: row.get(2)?})).optional().map_err(database_error)
}

pub(super) fn verify_session(
    connection: &Connection,
    task: &str,
    execution: &ExecutionContext,
) -> Result<(), AppError> {
    let current = active_session(connection, task)?;
    let valid = match (&current, &execution.requested_session_id) {
        (None, None) => true,
        (Some(binding), Some(id)) => binding.session_id == *id && binding.cwd == execution.cwd,
        _ => false,
    };
    if !valid {
        return Err(AppError::invalid(
            "작업의 세션 연결이 달라졌습니다. 작업을 다시 열어 주세요.",
        ));
    }
    Ok(())
}

fn validate(execution: &ExecutionContext) -> Result<(), AppError> {
    for id in [&execution.requested_session_id, &execution.retry_of]
        .into_iter()
        .flatten()
    {
        validate_id(id)?;
    }
    if !Path::new(&execution.cwd).is_absolute()
        || execution.cwd.len() > MAX_CWD_BYTES
        || execution.cwd.contains('\0')
        || execution.cli_version.is_empty()
        || execution.cli_version.len() > MAX_CLI_VERSION_BYTES
        || !execution
            .cli_version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
    {
        return Err(AppError::invalid(
            "CLI 실행 위치 또는 버전이 올바르지 않습니다.",
        ));
    }
    Ok(())
}

fn verify_retry(
    connection: &Connection,
    task: &str,
    previous: Option<&str>,
) -> Result<(), AppError> {
    let Some(id) = previous else {
        return Ok(());
    };
    let valid: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE id=?1 AND task_id=?2 AND status IN ('FAILED','CANCELLED'))", params![id,task], |row| row.get(0)).map_err(database_error)?;
    if !valid {
        return Err(AppError::invalid(
            "같은 작업의 실패하거나 중단한 요청만 재시도할 수 있습니다.",
        ));
    }
    Ok(())
}
