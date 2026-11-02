use super::{Store, errors::database_error, review_queries};
use crate::domain::{
    conversation::ConversationResult,
    document::validate_id,
    error::AppError,
    review::{Decision, Validity},
};
use rusqlite::{Connection, OptionalExtension};

impl Store {
    pub fn generation_result_ref(&self, job: &str) -> Result<Option<ConversationResult>, AppError> {
        validate_id(job)?;
        result_ref(&*self.connection()?, job)
    }
}

pub(super) fn result_ref(
    db: &Connection,
    job: &str,
) -> Result<Option<ConversationResult>, AppError> {
    let revision: Option<(String,String,u32)> = db.query_row(
        "SELECT json_extract(r.request_json,'$.batchId'),json_extract(r.request_json,'$.proposalId'),
            json_extract(r.request_json,'$.expectedRevision')+1
         FROM revision_jobs r JOIN jobs j ON j.id=r.job_id
         JOIN decision_events e ON e.id=json_extract(r.request_json,'$.operationId') AND e.kind='proposal_revision'
         WHERE r.job_id=?1 AND j.status='SUCCEEDED'", [job],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).optional().map_err(database_error)?;
    if let Some((batch_id, proposal_id, revision)) = revision {
        let proposal = review_queries::proposal_at(db, &batch_id, &proposal_id, revision)?;
        let batch = review_queries::batch(db, &batch_id)?;
        let status = if batch.status != "ACTIVE" {
            batch.status
        } else if proposal.validity != Validity::Valid && proposal.decision == Decision::Pending {
            format!("{:?}", proposal.validity).to_uppercase()
        } else {
            format!("{:?}", proposal.decision).to_uppercase()
        };
        return Ok(Some(ConversationResult {
            batch_id,
            proposal_id: Some(proposal_id),
            revision: Some(revision),
            status,
        }));
    }
    let batch: Option<String> = db.query_row(
        "SELECT b.id FROM proposal_batches b JOIN jobs j ON j.id=b.job_id WHERE j.id=?1 AND j.status='SUCCEEDED'",
        [job], |row| row.get(0),
    ).optional().map_err(database_error)?;
    batch.map(|id| batch_result(db, id)).transpose()
}

fn batch_result(db: &Connection, id: String) -> Result<ConversationResult, AppError> {
    let batch = review_queries::batch(db, &id)?;
    let status = if batch.status != "ACTIVE" {
        batch.status
    } else {
        let pending: Vec<_> = batch
            .proposals
            .iter()
            .filter(|p| p.decision == Decision::Pending)
            .collect();
        if pending.iter().any(|p| p.validity == Validity::Stale) {
            "STALE".into()
        } else if pending.iter().any(|p| p.validity == Validity::Conflict) {
            "CONFLICT".into()
        } else if batch.mode == "REWRITE" || !pending.is_empty() {
            "PENDING".into()
        } else if batch.proposals.is_empty() {
            "UNCHANGED".into()
        } else {
            "COMPLETED".into()
        }
    };
    Ok(ConversationResult {
        batch_id: id,
        proposal_id: None,
        revision: None,
        status,
    })
}
