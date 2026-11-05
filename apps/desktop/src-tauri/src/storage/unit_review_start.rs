use super::{
    Store,
    errors::{database_error, lock_error},
    files, review_queries, unit_review_records as records, unit_review_state,
};
use crate::{
    document::{
        review::stale,
        rewrite_plan::{PlannedUnit, plan},
    },
    domain::{error::AppError, review::ReviewBatch, unit_review::StartRewriteReview},
};
use rusqlite::Connection;

enum Source {
    Existing(Box<ReviewBatch>),
    Candidate { base: String, candidate: String },
}

impl Store {
    pub fn start_rewrite_review(
        &self,
        request: StartRewriteReview,
    ) -> Result<ReviewBatch, AppError> {
        request.validate()?;
        match self.unit_review_source(&request)? {
            Source::Existing(batch) => Ok(*batch),
            Source::Candidate { base, candidate } => {
                let units = plan(&base, &candidate)?;
                self.register_unit_review(&request, &units)
            }
        }
    }

    fn unit_review_source(&self, request: &StartRewriteReview) -> Result<Source, AppError> {
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut db = self.connection()?;
        let batch = review_queries::batch(&db, &request.batch_id)?;
        let payload = records::payload(request)?;
        if records::replay(&db, &request.operation_id, records::START_EVENT, &payload)? {
            return Ok(Source::Existing(Box::new(batch)));
        }
        validate_source(&db, &batch, request)?;
        if batch.is_unit_review() {
            let tx = db.transaction().map_err(database_error)?;
            records::event(
                &tx,
                &batch,
                &request.operation_id,
                (records::START_EVENT, &payload),
                self.runtime.now_ms()?,
            )?;
            tx.commit().map_err(database_error)?;
            return Ok(Source::Existing(Box::new(batch)));
        }
        Ok(Source::Candidate {
            base: review_queries::base(&db, &batch)?,
            candidate: batch.candidate_markdown.ok_or_else(stale)?,
        })
    }

    fn register_unit_review(
        &self,
        request: &StartRewriteReview,
        units: &[PlannedUnit],
    ) -> Result<ReviewBatch, AppError> {
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut db = self.connection()?;
        let payload = records::payload(request)?;
        if records::replay(&db, &request.operation_id, records::START_EVENT, &payload)? {
            return review_queries::batch(&db, &request.batch_id);
        }
        let batch = review_queries::batch(&db, &request.batch_id)?;
        validate_source(&db, &batch, request)?;
        let tx = db.transaction().map_err(database_error)?;
        if !batch.is_unit_review() {
            records::plan(&tx, self.runtime.as_ref(), &batch, units)?;
        }
        records::event(
            &tx,
            &batch,
            &request.operation_id,
            (records::START_EVENT, &payload),
            self.runtime.now_ms()?,
        )?;
        tx.commit().map_err(database_error)?;
        review_queries::batch(&db, &batch.id)
    }
}

fn validate_source(
    db: &Connection,
    batch: &ReviewBatch,
    request: &StartRewriteReview,
) -> Result<(), AppError> {
    if batch.document_id != request.document_id
        || batch.mode != "REWRITE"
        || batch.base_version_id != request.expected_head_id
        || batch
            .candidate_markdown
            .as_ref()
            .is_none_or(|c| files::content_hash(c) != request.candidate_hash)
    {
        return Err(stale());
    }
    unit_review_state::current(db, batch, Some(&request.expected_head_id))?;
    Ok(())
}
