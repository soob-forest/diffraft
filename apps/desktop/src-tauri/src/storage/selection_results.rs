use super::{
    Store,
    errors::{database_error, lock_error},
    review_queries,
    selection_jobs::saved_request,
    selection_source,
};
use crate::{
    document::{patch::invalid_patch, selection::replace_selection},
    domain::{
        ai::AiResponse,
        error::AppError,
        review::{ReviewBatch, ReviewJob},
        selection_request::SelectionJobTarget,
    },
};
use rusqlite::params;

impl Store {
    pub fn complete_selection_request(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: Option<&str>,
    ) -> Result<ReviewBatch, AppError> {
        let request = saved_request(&*self.connection()?, job)?;
        if matches!(request.target, SelectionJobTarget::Confirmed(_)) {
            return match session {
                Some(session) => self.complete_patch(job, response, session),
                None => self.register_patch(job, response),
            };
        }
        response.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut db = self.connection()?;
        saved_request(&db, job)?;
        let source = selection_source::source(&db, &request)?;
        let (reference, candidate) = source.rewrite.ok_or_else(invalid_patch)?;
        let AiResponse::Patch {
            summary, changes, ..
        } = response
        else {
            return Err(invalid_patch());
        };
        if changes.len() != 1
            || changes[0].block_id != "candidate"
            || changes[0].before != request.selection().quote
        {
            return Err(invalid_patch());
        }
        let candidate = replace_selection(&candidate, request.selection(), &changes[0].after)?;
        let id = self.runtime.id();
        let tx = db.transaction().map_err(database_error)?;
        tx.execute("INSERT INTO proposal_batches(id,job_id,mode,base_version_id,apply_head_id,status,summary,candidate_markdown,created_at) VALUES(?1,?2,'REWRITE',?3,?3,'ACTIVE',?4,?5,?6)",params![id,job.id,source.head.version_id,summary,candidate,self.runtime.now_ms()?]).map_err(database_error)?;
        tx.execute(
            "UPDATE proposal_batches SET status='ARCHIVED' WHERE id=?1 AND status='ACTIVE'",
            [reference.id],
        )
        .map_err(database_error)?;
        self.complete_generation(&tx, job, response, session)?;
        tx.commit().map_err(database_error)?;
        review_queries::batch(&db, &id)
    }
}
