use super::{
    Store,
    errors::{database_error, lock_error},
    job_lifecycle::require_running,
    regeneration_context, review_queries,
};
use crate::{
    document::{patch::invalid_patch, revisions::revise},
    domain::{
        ai::AiResponse,
        error::AppError,
        regeneration::RegenerateRequest,
        review::{ReviewBatch, ReviewJob},
    },
};
use rusqlite::params;

impl Store {
    pub fn register_regeneration(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
    ) -> Result<ReviewBatch, AppError> {
        self.register_regeneration_result(job, response, None)
    }

    pub fn complete_regeneration(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: &str,
    ) -> Result<ReviewBatch, AppError> {
        self.register_regeneration_result(job, response, Some(session))
    }

    fn register_regeneration_result(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: Option<&str>,
    ) -> Result<ReviewBatch, AppError> {
        response.validate()?;
        let request = {
            let connection = self.connection()?;
            require_running(&connection, job)?;
            let json: String = connection
                .query_row(
                    "SELECT request_json FROM revision_jobs WHERE job_id=?1",
                    [&job.id],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            serde_json::from_str::<RegenerateRequest>(&json)
                .map_err(|_| AppError::invalid("재제안 요청을 읽을 수 없습니다."))?
        };
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        require_running(&connection, job)?;
        let (_, mut batch, old) = regeneration_context::target(&connection, &request)?;
        let AiResponse::Patch { changes, .. } = response else {
            return Err(invalid_patch());
        };
        if changes.len() != 1
            || changes[0].before != old.operation.before
            || changes[0].block_id != old.operation.block_id
        {
            return Err(invalid_patch());
        }
        let revision = request.revision(changes[0].after.clone());
        let base = review_queries::base(&connection, &batch)?;
        let scope = review_queries::scope(&connection, &batch.id)?;
        let mut proposal = revise(&base, &scope, &mut batch, &revision)?;
        proposal.operation.reason = changes[0].reason.clone();
        let json = serde_json::to_string(response).map_err(|_| invalid_patch())?;
        let transaction = connection.transaction().map_err(database_error)?;
        self.persist_revision(&transaction, &batch, &proposal, &revision)?;
        transaction
            .execute(
                "UPDATE revision_jobs SET response_json=?1 WHERE job_id=?2",
                params![json, job.id],
            )
            .map_err(database_error)?;
        self.complete_generation(&transaction, job, response, session)?;
        transaction.commit().map_err(database_error)?;
        review_queries::batch(&connection, &batch.id)
    }
}
