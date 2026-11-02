use super::{ExecutionInput, run};
use crate::{
    claude_adapter::execution::CliLauncher,
    domain::{
        ai::ResponseMode, error::AppError, review::ReviewBatch, selection_request::SelectionRequest,
    },
    storage::Store,
};
use std::sync::{Arc, atomic::AtomicBool};

pub fn execute(
    store: &Store,
    launcher: &CliLauncher,
    request: SelectionRequest,
    cancelled: Arc<AtomicBool>,
) -> Result<ReviewBatch, AppError> {
    let retry_of = request.retry_of.clone();
    let job = store.begin_selection_request(request)?;
    if let Some(batch) = store.completed_selection_request(&job)? {
        return Ok(batch);
    }
    let result = (|| {
        let context = store.selection_job_context(&job)?;
        let completion = run(
            store,
            launcher,
            &job,
            ExecutionInput {
                mode: ResponseMode::Patch,
                retry_of,
                context: &context,
            },
            cancelled,
        )?;
        store.complete_selection_request(&job, &completion.response, Some(&completion.session_id))
    })();
    if let Err(error) = &result {
        store.finish_failed_job(&job, error.code)?;
    }
    result
}
