use super::errors::database_error;
use crate::domain::{
    error::AppError,
    review::{ProposalRevision, ReviewBatch},
    unit_review::{ReviewPlan, ReviewUnit},
};
use rusqlite::{Connection, OptionalExtension};

pub(super) fn attach(db: &Connection, batch: &mut ReviewBatch) -> Result<(), AppError> {
    batch.review_plan = db.query_row(
        "SELECT id,base_version_id,candidate_hash,algorithm_version FROM review_plans WHERE batch_id=?1",
        [&batch.id], |row| Ok(ReviewPlan { id: row.get(0)?, base_version_id: row.get(1)?, candidate_hash: row.get(2)?, algorithm_version: row.get(3)? }),
    ).optional().map_err(database_error)?;
    let mut statement = db.prepare("SELECT id,plan_id,number,title,kind,reason,review_revision FROM review_units WHERE batch_id=?1 ORDER BY number").map_err(database_error)?;
    batch.review_units = statement
        .query_map([&batch.id], |row| {
            Ok(ReviewUnit {
                id: row.get(0)?,
                plan_id: row.get(1)?,
                number: row.get(2)?,
                title: row.get(3)?,
                kind: row.get(4)?,
                reason: row.get(5)?,
                review_revision: row.get(6)?,
                proposals: Vec::new(),
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    for unit in &mut batch.review_units {
        unit.proposals = batch
            .proposals
            .iter()
            .filter(|p| p.group_id == unit.id)
            .map(|p| ProposalRevision {
                id: p.id.clone(),
                revision: p.revision,
            })
            .collect();
    }
    validate_attachment(batch)?;
    validate_operations(db, batch)
}

fn validate_operations(db: &Connection, batch: &ReviewBatch) -> Result<(), AppError> {
    if !batch.is_unit_review() {
        return Ok(());
    }
    let plan = batch.review_plan.as_ref().ok_or_else(invalid_plan)?;
    if batch
        .candidate_markdown
        .as_ref()
        .is_none_or(|c| super::files::content_hash(c) != plan.candidate_hash)
    {
        return Err(invalid_plan());
    }
    for proposal in &batch.proposals {
        let original = super::review_queries::proposal_at(db, &batch.id, &proposal.id, 1)?;
        if original.group_id != proposal.group_id || original.operation != proposal.operation {
            return Err(invalid_plan());
        }
    }
    Ok(())
}

fn validate_attachment(batch: &ReviewBatch) -> Result<(), AppError> {
    if !batch.is_unit_review() {
        return Ok(());
    }
    let plan = batch.review_plan.as_ref().ok_or_else(invalid_plan)?;
    if plan.base_version_id != batch.base_version_id
        || batch
            .review_units
            .iter()
            .any(|u| u.plan_id != plan.id || u.proposals.is_empty())
        || batch.proposals.iter().any(|p| {
            !batch
                .review_units
                .iter()
                .any(|u| u.id == p.group_id && u.review_revision == p.revision)
        })
    {
        return Err(invalid_plan());
    }
    Ok(())
}

pub(super) fn invalid_plan() -> AppError {
    AppError::invalid("저장된 변경별 검토 계획이 일치하지 않습니다. 원래 후보를 확인해 주세요.")
}
