use super::{files, queries, review_queries};
use crate::{
    document::review::{stale, valid_head},
    domain::{
        document::DocumentSnapshot,
        error::{AppError, ErrorCode},
        review::ReviewBatch,
        unit_review::ReviewUnit,
    },
};
use rusqlite::Connection;
use std::path::Path;

pub(super) fn current(
    db: &Connection,
    batch: &ReviewBatch,
    expected: Option<&str>,
) -> Result<DocumentSnapshot, AppError> {
    if review_queries::active_job(db)? {
        return Err(AppError::new(
            ErrorCode::Busy,
            "생성을 완료하거나 중단한 뒤 검토해 주세요.",
        ));
    }
    let head = queries::snapshot(db, &batch.document_id)?;
    if expected.is_some_and(|id| id != head.version_id) {
        return Err(stale());
    }
    valid_head(&review_queries::base(db, batch)?, batch, &head)?;
    if let Err(error) = files::verify_hash(Path::new(&head.path), &head.content_hash) {
        queries::set_status(db, &head.id, "CONFLICT")?;
        return Err(error);
    }
    Ok(head)
}

pub(super) fn unit<'a>(
    batch: &'a ReviewBatch,
    plan: &str,
    id: &str,
) -> Result<&'a ReviewUnit, AppError> {
    if !batch.is_unit_review() || batch.review_plan.as_ref().is_none_or(|p| p.id != plan) {
        return Err(stale());
    }
    batch
        .review_units
        .iter()
        .find(|u| u.id == id && u.plan_id == plan)
        .ok_or_else(stale)
}
