use super::{
    Store,
    errors::{database_error, lock_error},
    review_queries, unit_review_records as records, unit_review_state,
};
use crate::{
    document::review::stale,
    domain::{
        error::AppError,
        review::{Decision, ReviewBatch, Validity},
        unit_review::ReopenUnitReview,
    },
};

impl Store {
    pub fn reopen_unit_review(&self, request: ReopenUnitReview) -> Result<ReviewBatch, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut db = self.connection()?;
        let payload = records::payload(&request)?;
        if records::replay(&db, &request.operation_id, records::REOPEN_EVENT, &payload)? {
            return review_queries::batch(&db, &request.batch_id);
        }
        let batch = review_queries::batch(&db, &request.batch_id)?;
        if batch.document_id != request.document_id {
            return Err(stale());
        }
        unit_review_state::current(&db, &batch, Some(&request.expected_head_id))?;
        validate_reopen(&batch, &request)?;
        let tx = db.transaction().map_err(database_error)?;
        let next = request.expected_review_revision + 1;
        let changed = tx
            .execute(
                "UPDATE review_units SET review_revision=?1 WHERE id=?2 AND review_revision=?3",
                rusqlite::params![next, request.unit_id, request.expected_review_revision],
            )
            .map_err(database_error)?;
        if changed != 1 {
            return Err(stale());
        }
        let now = self.runtime.now_ms()?;
        copy_proposals(&tx, &batch, &request, now)?;
        records::event(
            &tx,
            &batch,
            &request.operation_id,
            (records::REOPEN_EVENT, &payload),
            now,
        )?;
        tx.commit().map_err(database_error)?;
        review_queries::batch(&db, &batch.id)
    }
}

fn validate_reopen(batch: &ReviewBatch, request: &ReopenUnitReview) -> Result<(), AppError> {
    let unit = unit_review_state::unit(batch, &request.plan_id, &request.unit_id)?;
    if unit.review_revision != request.expected_review_revision
        || unit.proposals.is_empty()
        || batch
            .proposals
            .iter()
            .filter(|p| p.group_id == unit.id)
            .any(|p| p.decision != Decision::Rejected || p.validity != Validity::Valid)
    {
        return Err(stale());
    }
    Ok(())
}

fn copy_proposals(
    tx: &rusqlite::Transaction<'_>,
    batch: &ReviewBatch,
    request: &ReopenUnitReview,
    now: i64,
) -> Result<(), AppError> {
    for p in batch
        .proposals
        .iter()
        .filter(|p| p.group_id == request.unit_id)
    {
        records::proposal(
            tx,
            records::ProposalRecord {
                id: &p.id,
                batch: &batch.id,
                group: &p.group_id,
                revision: request.expected_review_revision + 1,
                created_at: now,
            },
            &p.operation,
        )?;
    }
    Ok(())
}
