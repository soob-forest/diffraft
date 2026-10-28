use super::{
    connection, guarded_process,
    process::ProcessSpec,
    result::{self, AiCompletion},
};
use crate::{
    domain::{
        ai::ResponseMode,
        error::{AppError, ErrorCode},
        review::ReviewJob,
    },
    storage::{Store, generation_models::ExecutionContext},
};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub enum CliLauncher {
    Installed,
    #[cfg(any(feature = "test-support", feature = "e2e"))]
    Fixture(ProcessSpec),
}

pub struct PreparedExecution {
    pub spec: ProcessSpec,
    pub context: ExecutionContext,
}

impl CliLauncher {
    pub fn prepare(
        &self,
        store: &Store,
        job: &ReviewJob,
        mode: ResponseMode,
        retry_of: Option<String>,
    ) -> Result<PreparedExecution, AppError> {
        let task = store.job_task(job)?;
        let binding = store.active_session(&task)?;
        let session = binding.map(|binding| binding.session_id);
        let connection::PreparedCli { spec, version } =
            self.prepare_cli(store.directory(), &task, mode, session.as_deref())?;
        let cwd = spec
            .directory
            .to_str()
            .ok_or_else(|| AppError::invalid("CLI 실행 위치는 UTF-8이어야 합니다."))?
            .to_owned();
        Ok(PreparedExecution {
            spec,
            context: ExecutionContext {
                mode,
                requested_session_id: session,
                cwd,
                cli_version: version,
                retry_of,
            },
        })
    }

    fn prepare_cli(
        &self,
        directory: &std::path::Path,
        task: &str,
        mode: ResponseMode,
        session: Option<&str>,
    ) -> Result<connection::PreparedCli, AppError> {
        match self {
            Self::Installed => connection::prepared(directory, task, mode, session),
            #[cfg(any(feature = "test-support", feature = "e2e"))]
            Self::Fixture(spec) => {
                let mut spec = spec.clone();
                if let Some(id) = session {
                    spec.args.extend(["--resume".into(), id.into()]);
                }
                Ok(connection::PreparedCli {
                    spec,
                    version: "fixture".into(),
                })
            }
        }
    }
}

pub fn run(
    store: &Store,
    job: &ReviewJob,
    input: &str,
    prepared: PreparedExecution,
    cancelled: Arc<AtomicBool>,
) -> Result<AiCompletion, AppError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    store.record_execution(job, &prepared.context)?;
    let output = guarded_process::run(
        &prepared.spec,
        input.as_bytes(),
        cancelled.clone(),
        store.directory(),
    )?;
    if cancelled.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    result::completion(&output)
}

fn cancelled_error() -> AppError {
    AppError::new(
        ErrorCode::Cancelled,
        "생성을 중단했습니다. 결과를 등록하지 않았습니다.",
    )
}
