use super::{
    Store,
    errors::database_error,
    generation_execution, generation_messages,
    generation_models::{SessionBinding, mode_name},
    job_lifecycle::require_running,
};
use crate::domain::{
    ai::ResponseMode,
    document::validate_id,
    error::AppError,
    provider::{ProviderModel, validate_provider_id},
    review::ReviewJob,
};
use rusqlite::{Connection, OptionalExtension, params};

pub struct CodexExecution {
    pub model: ProviderModel,
    pub mode: ResponseMode,
    pub requested_session: Option<String>,
    pub cwd: String,
    pub cli_version: String,
    pub retry_of: Option<String>,
    pub account_scope: String,
}

impl Store {
    pub fn codex_session(
        &self,
        task: &str,
        scope: &str,
    ) -> Result<Option<SessionBinding>, AppError> {
        validate_id(task)?;
        validate_scope(scope)?;
        session(&*self.connection()?, task, scope)
    }

    pub fn record_codex_execution(
        &self,
        job: &ReviewJob,
        execution: &CodexExecution,
    ) -> Result<(), AppError> {
        execution.validate()?;
        let mut connection = self.connection()?;
        require_running(&connection, job)?;
        let task = generation_execution::task(&connection, job)?;
        verify_session(&connection, &task, execution)?;
        generation_execution::verify_retry(&connection, &task, execution.retry_of.as_deref())?;
        let model = super::job_model::provider_model(&connection, &job.id)?;
        if model != execution.model {
            return Err(invalid());
        }
        if let Some(previous) = &execution.retry_of
            && super::job_model::provider_model(&connection, previous)? != model
        {
            return Err(invalid());
        }
        let model = serde_json::to_string(&model).map_err(|_| invalid())?;
        let instruction = generation_messages::instruction(&connection, job)?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO job_executions(job_id,mode,requested_session_id,cwd,cli_version,retry_of,requested_model) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![job.id, mode_name(execution.mode), execution.requested_session, execution.cwd, execution.cli_version, execution.retry_of, model]).map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO codex_execution_scopes VALUES(?1,?2)",
                params![job.id, execution.account_scope],
            )
            .map_err(database_error)?;
        self.insert_generation_message(&transaction, job, "USER", &instruction)?;
        transaction.commit().map_err(database_error)
    }
}

impl CodexExecution {
    pub fn validate(&self) -> Result<(), AppError> {
        self.model.validate()?;
        if !matches!(self.model, ProviderModel::Codex { .. }) {
            return Err(invalid());
        }
        validate_scope(&self.account_scope)?;
        if let Some(id) = &self.requested_session {
            validate_provider_id(id)?;
        }
        if let Some(id) = &self.retry_of {
            validate_id(id)?;
        }
        if !std::path::Path::new(&self.cwd).is_absolute()
            || self.cwd.len() > 4096
            || self.cwd.contains('\0')
            || self.cli_version.is_empty()
            || self.cli_version.len() > 64
            || !self
                .cli_version
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-".contains(&b))
        {
            return Err(invalid());
        }
        Ok(())
    }
}

pub(super) fn session(
    connection: &Connection,
    task: &str,
    scope: &str,
) -> Result<Option<SessionBinding>, AppError> {
    connection.query_row("SELECT thread_id,cwd,cli_version FROM codex_sessions WHERE task_id=?1 AND account_scope=?2 AND status='ACTIVE'",params![task,scope],
        |row| Ok(SessionBinding {session_id:row.get(0)?,cwd:row.get(1)?,cli_version:row.get(2)?})).optional().map_err(database_error)
}

pub(super) fn verify_session(
    connection: &Connection,
    task: &str,
    execution: &CodexExecution,
) -> Result<(), AppError> {
    let current = session(connection, task, &execution.account_scope)?;
    match (current, &execution.requested_session) {
        (None, None) => Ok(()),
        (Some(binding), Some(id)) if binding.session_id == *id && binding.cwd == execution.cwd => {
            Ok(())
        }
        _ => Err(invalid()),
    }
}

fn validate_scope(scope: &str) -> Result<(), AppError> {
    if scope.len() != 64
        || !scope
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(invalid());
    }
    Ok(())
}

pub(super) fn invalid() -> AppError {
    AppError::invalid("Codex 요청의 모델·계정 또는 세션 연결이 저장 기록과 다릅니다.")
}
