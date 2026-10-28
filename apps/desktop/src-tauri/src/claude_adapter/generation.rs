use super::execution::{self, CliLauncher};
use crate::{
    domain::{
        ai::ResponseMode,
        error::AppError,
        generation::{GenerateRequest, GenerationOutcome},
    },
    storage::Store,
};
use std::sync::{Arc, atomic::AtomicBool};

pub fn execute(
    store: &Store,
    launcher: &CliLauncher,
    request: GenerateRequest,
    cancelled: Arc<AtomicBool>,
) -> Result<GenerationOutcome, AppError> {
    let mode = request.mode;
    let retry_of = request.retry_of.clone();
    let job = store.begin_generation(request)?;
    if let Some(result) = store.completed_generation(&job)? {
        return Ok(result);
    }
    let result = (|| {
        let input = store.generation_context(&job)?;
        let prepared = launcher.prepare(store, &job, mode, retry_of)?;
        let completion = execution::run(store, &job, &input, prepared, cancelled)?;
        if mode == ResponseMode::Explain {
            store.complete_explanation(&job, &completion.response, &completion.session_id)
        } else {
            store
                .complete_patch(&job, &completion.response, &completion.session_id)
                .map(|batch| GenerationOutcome::Patch(Box::new(batch)))
        }
    })();
    if let Err(error) = &result {
        store.finish_failed_job(&job, error.code)?;
    }
    result
}
