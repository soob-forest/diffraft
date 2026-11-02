use crate::{
    claude_adapter::{
        execution::{self, CliLauncher},
        result::AiCompletion,
    },
    codex_adapter::{
        client::{Client, TurnInput},
        launch,
    },
    domain::{
        ai::ResponseMode,
        error::{AppError, ErrorCode},
        provider::ProviderModel,
        review::ReviewJob,
    },
    storage::{Store, codex_execution::CodexExecution},
};
pub mod selection;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub struct ExecutionInput<'a> {
    pub mode: ResponseMode,
    pub retry_of: Option<String>,
    pub context: &'a str,
}

pub fn run(
    store: &Store,
    launcher: &CliLauncher,
    job: &ReviewJob,
    input: ExecutionInput<'_>,
    cancelled: Arc<AtomicBool>,
) -> Result<AiCompletion, AppError> {
    match store.job_provider_model(job)? {
        ProviderModel::Claude { .. } => {
            let prepared = launcher.prepare(store, job, input.mode, input.retry_of)?;
            execution::run(store, job, input.context, prepared, cancelled)
        }
        model @ ProviderModel::Codex { .. } => {
            codex(store, launcher, job, (input, model), cancelled)
        }
    }
}

fn codex(
    store: &Store,
    launcher: &CliLauncher,
    job: &ReviewJob,
    request: (ExecutionInput<'_>, ProviderModel),
    cancelled: Arc<AtomicBool>,
) -> Result<AiCompletion, AppError> {
    let (input, model) = request;
    let task = store.job_task(job)?;
    let (spec, version) = match launcher {
        CliLauncher::Installed => launch::prepare(store, &task, cancelled.clone())?,
        #[cfg(any(feature = "test-support", feature = "e2e"))]
        CliLauncher::CodexFixture(spec) => (spec.clone(), "fixture".into()),
        #[cfg(any(feature = "test-support", feature = "e2e"))]
        CliLauncher::Fixture(_) => {
            return Err(AppError::invalid(
                "Codex 요청에 Claude fixture를 사용할 수 없습니다.",
            ));
        }
    };
    let mut client = Client::connect(&spec, store.directory(), cancelled.clone())?;
    let session = store.codex_session(&task, &client.account.0)?;
    let execution = CodexExecution {
        model: model.clone(),
        mode: input.mode,
        requested_session: session.map(|s| s.session_id),
        cwd: spec.directory.to_string_lossy().into_owned(),
        cli_version: version,
        retry_of: input.retry_of,
        account_scope: client.account.0.clone(),
    };
    let result = (|| {
        store.record_codex_execution(job, &execution)?;
        client.generate(
            &spec.directory,
            TurnInput {
                model: &model,
                session: execution.requested_session.as_deref(),
                input: input.context,
                mode: input.mode,
            },
            &cancelled,
        )
    })();
    client.close()?;
    if cancelled.load(Ordering::Acquire) {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "Codex 생성을 중단하여 결과를 등록하지 않았습니다.",
        ));
    }
    result
}
