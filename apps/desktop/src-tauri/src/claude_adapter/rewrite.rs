use super::execution::{self, CliLauncher};
use crate::{
    domain::{ai::ResponseMode, error::AppError, review::ReviewBatch, rewrite::RewriteRequest},
    storage::Store,
};
use std::sync::{Arc, atomic::AtomicBool};

pub fn execute(
    store: &Store,
    launcher: &CliLauncher,
    request: RewriteRequest,
    cancelled: Arc<AtomicBool>,
) -> Result<ReviewBatch, AppError> {
    let retry_of = request.retry_of.clone();
    let job = store.begin_rewrite(request)?;
    if let Some(batch) = store.completed_rewrite(&job)? {
        return Ok(batch);
    }
    let result = (|| {
        let context = store.rewrite_context(&job)?;
        let prepared = launcher.prepare(store, &job, ResponseMode::Rewrite, retry_of)?;
        let completion = execution::run(store, &job, &context, prepared, cancelled)?;
        store.complete_rewrite(&job, &completion.response, &completion.session_id)
    })();
    if let Err(error) = &result {
        store.finish_failed_job(&job, error.code)?;
    }
    result
}
