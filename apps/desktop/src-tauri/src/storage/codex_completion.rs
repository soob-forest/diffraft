use super::{
    Store,
    codex_execution::{self, CodexExecution, invalid},
    errors::database_error,
    generation_completion::{response_mode, response_text},
    generation_execution,
};
use crate::domain::{
    ai::{AiResponse, ResponseMode},
    error::AppError,
    provider::{ProviderModel, validate_provider_id},
    review::ReviewJob,
};
use rusqlite::{Connection, OptionalExtension, params};

type ExecutionRow = (
    String,
    Option<String>,
    String,
    String,
    Option<String>,
    String,
    String,
);

impl Store {
    pub(super) fn complete_codex_session(
        &self,
        connection: &Connection,
        job: &ReviewJob,
        response: &AiResponse,
        session: Option<&str>,
    ) -> Result<bool, AppError> {
        let Some(execution) = execution(connection, job)? else {
            return Ok(false);
        };
        let id = session.ok_or_else(invalid)?;
        validate_provider_id(id)?;
        if response_mode(response) != execution.mode
            || execution
                .requested_session
                .as_deref()
                .is_some_and(|expected| expected != id)
        {
            return Err(invalid());
        }
        let task = generation_execution::task(connection, job)?;
        codex_execution::verify_session(connection, &task, &execution)?;
        bind(connection, &task, id, &execution)?;
        self.insert_generation_message(connection, job, "ASSISTANT", response_text(response))?;
        connection
            .execute(
                "UPDATE job_executions SET response_session_id=?1 WHERE job_id=?2",
                params![id, job.id],
            )
            .map_err(database_error)?;
        Ok(true)
    }
}

fn execution(connection: &Connection, job: &ReviewJob) -> Result<Option<CodexExecution>, AppError> {
    let row: Option<ExecutionRow> = connection.query_row("SELECT e.mode,e.requested_session_id,e.cwd,e.cli_version,e.retry_of,e.requested_model,c.account_scope FROM job_executions e JOIN codex_execution_scopes c ON c.job_id=e.job_id WHERE e.job_id=?1",[&job.id],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?))).optional().map_err(database_error)?;
    row.map(
        |(mode, requested_session, cwd, cli_version, retry_of, model, account_scope)| {
            let mode = match mode.as_str() {
                "PATCH" => ResponseMode::Patch,
                "EXPLAIN" => ResponseMode::Explain,
                "REWRITE" => ResponseMode::Rewrite,
                _ => return Err(invalid()),
            };
            let model: ProviderModel = serde_json::from_str(&model).map_err(|_| invalid())?;
            let result = CodexExecution {
                model,
                mode,
                requested_session,
                cwd,
                cli_version,
                retry_of,
                account_scope,
            };
            result.validate()?;
            Ok(result)
        },
    )
    .transpose()
}

fn bind(
    connection: &Connection,
    task: &str,
    id: &str,
    execution: &CodexExecution,
) -> Result<(), AppError> {
    let owner: Option<String> = connection
        .query_row(
            "SELECT task_id FROM codex_sessions WHERE account_scope=?1 AND thread_id=?2",
            params![execution.account_scope, id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    if owner.is_some_and(|owner| owner != task) {
        return Err(invalid());
    }
    connection.execute("INSERT INTO codex_sessions(task_id,account_scope,thread_id,cwd,cli_version,status) VALUES(?1,?2,?3,?4,?5,'ACTIVE') ON CONFLICT(task_id,account_scope) DO UPDATE SET thread_id=excluded.thread_id,cwd=excluded.cwd,cli_version=excluded.cli_version,status='ACTIVE'",params![task,execution.account_scope,id,execution.cwd,execution.cli_version]).map_err(database_error)?;
    Ok(())
}
