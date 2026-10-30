use super::{
    Store,
    errors::database_error,
    generation_execution,
    generation_models::{ExecutionContext, mode_name},
    job_lifecycle::require_running,
};
use crate::domain::{
    ai::{AiResponse, ResponseMode},
    document::validate_id,
    error::{AppError, ErrorCode},
    review::ReviewJob,
};
use rusqlite::{Connection, OptionalExtension, params};

type ExecutionRow = (
    String,
    Option<String>,
    String,
    String,
    Option<String>,
    Option<String>,
);

impl Store {
    pub(super) fn complete_generation(
        &self,
        connection: &Connection,
        job: &ReviewJob,
        response: &AiResponse,
        session: Option<&str>,
    ) -> Result<(), AppError> {
        require_running(connection, job)?;
        response.validate()?;
        if let Some(execution) = execution(connection, job)? {
            let id = session.ok_or_else(invalid_session)?;
            validate_id(id).map_err(|_| invalid_session())?;
            if response_mode(response) != execution.mode
                || execution
                    .requested_session_id
                    .as_deref()
                    .is_some_and(|expected| expected != id)
            {
                return Err(invalid_session());
            }
            let task = generation_execution::task(connection, job)?;
            generation_execution::verify_session(connection, &task, &execution)?;
            self.bind_session(connection, &task, id, &execution)?;
            self.insert_generation_message(connection, job, "ASSISTANT", response_text(response))?;
            connection
                .execute(
                    "UPDATE job_executions SET response_session_id=?1 WHERE job_id=?2",
                    params![id, job.id],
                )
                .map_err(database_error)?;
        } else if session.is_some() {
            return Err(invalid_session());
        }
        connection.execute("UPDATE jobs SET status='SUCCEEDED' WHERE id=?1 AND attempt_id=?2 AND status='RUNNING'", params![job.id,job.attempt_id]).map_err(database_error)?;
        Ok(())
    }

    fn bind_session(
        &self,
        connection: &Connection,
        task: &str,
        session: &str,
        execution: &ExecutionContext,
    ) -> Result<(), AppError> {
        let owner: Option<(String, String)> = connection
            .query_row(
                "SELECT task_id,status FROM session_bindings WHERE cli_session_id=?1",
                [session],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(database_error)?;
        if let Some((owner, status)) = owner {
            if owner != task
                || status != "ACTIVE"
                || execution.requested_session_id.as_deref() != Some(session)
            {
                return Err(invalid_session());
            }
            connection.execute(
                "UPDATE session_bindings SET cli_version=?1 WHERE task_id=?2 AND cli_session_id=?3 AND status='ACTIVE'",
                params![execution.cli_version, task, session],
            ).map_err(database_error)?;
            return Ok(());
        }
        connection.execute("INSERT INTO session_bindings(id,task_id,cli_session_id,cwd,cli_version,status,created_at) VALUES(?1,?2,?3,?4,?5,'ACTIVE',?6)", params![self.runtime.id(),task,session,execution.cwd,execution.cli_version,self.runtime.now_ms()?]).map_err(database_error)?;
        Ok(())
    }
}

fn execution(
    connection: &Connection,
    job: &ReviewJob,
) -> Result<Option<ExecutionContext>, AppError> {
    let row: Option<ExecutionRow> = connection.query_row("SELECT mode,requested_session_id,cwd,cli_version,retry_of,requested_model FROM job_executions WHERE job_id=?1", [&job.id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?))).optional().map_err(database_error)?;
    row.map(
        |(mode, requested_session_id, cwd, cli_version, retry_of, model)| {
            let mode = [
                ResponseMode::Patch,
                ResponseMode::Rewrite,
                ResponseMode::Explain,
            ]
            .into_iter()
            .find(|candidate| mode_name(*candidate) == mode)
            .ok_or_else(invalid_session)?;
            let requested_model = model
                .map(|value| {
                    serde_json::from_value(serde_json::Value::String(value))
                        .map_err(|_| invalid_session())
                })
                .transpose()?;
            Ok(ExecutionContext {
                requested_model,
                mode,
                requested_session_id,
                cwd,
                cli_version,
                retry_of,
            })
        },
    )
    .transpose()
}

fn response_mode(response: &AiResponse) -> ResponseMode {
    match response {
        AiResponse::Patch { .. } => ResponseMode::Patch,
        AiResponse::Rewrite { .. } => ResponseMode::Rewrite,
        AiResponse::Explain { .. } => ResponseMode::Explain,
    }
}

fn response_text(response: &AiResponse) -> &str {
    match response {
        AiResponse::Patch { summary, .. } | AiResponse::Rewrite { summary, .. } => summary,
        AiResponse::Explain { answer, .. } => answer,
    }
}

fn invalid_session() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "응답 모드 또는 작업 세션이 요청과 일치하지 않습니다. 결과를 등록하지 않았습니다.",
    )
}
