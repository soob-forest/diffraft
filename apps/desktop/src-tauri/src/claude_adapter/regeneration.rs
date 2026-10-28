use super::execution::{self, CliLauncher};
use crate::{
    domain::{
        ai::ResponseMode, error::AppError, regeneration::RegenerateRequest, review::ReviewBatch,
    },
    storage::Store,
};
use std::sync::{Arc, atomic::AtomicBool};

pub fn execute(
    store: &Store,
    launcher: &CliLauncher,
    request: RegenerateRequest,
    cancelled: Arc<AtomicBool>,
) -> Result<ReviewBatch, AppError> {
    let retry_of = request.retry_of.clone();
    let job = store.begin_regeneration(request)?;
    if let Some(batch) = store.completed_regeneration(&job)? {
        return Ok(batch);
    }
    let result = (|| {
        let context = store.regeneration_context(&job)?;
        let prepared = launcher.prepare(store, &job, ResponseMode::Patch, retry_of)?;
        let completion = execution::run(store, &job, &context, prepared, cancelled)?;
        store.complete_regeneration(&job, &completion.response, &completion.session_id)
    })();
    if let Err(error) = &result {
        store.finish_failed_job(&job, error.code)?;
    }
    result
}
