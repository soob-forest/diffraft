use super::{
    errors::{conflict, database_error},
    models::{SaveEffects, SaveReason, SaveRecord},
    review_queries,
};
use crate::{
    document::review::{reconstruct, validate_decision},
    domain::{error::AppError, review::Decision},
};
use rusqlite::{Connection, params};

pub fn validate(record: &SaveRecord) -> Result<(), AppError> {
    super::restoration::validate_record(record)?;
    super::rewrite_apply::validate_record(record)?;
    super::resolutions::validate_record(record)?;
    if let SaveEffects::Accept { request } = &record.effects {
        request.validate()?;
        if request.document_id != record.request.document_id
            || request.operation_id != record.request.operation_id
            || request.expected_head_id != record.previous.version_id
            || record.request.reason != SaveReason::Accept
        {
            return Err(conflict());
        }
    }
    Ok(())
}

pub fn commit(connection: &Connection, record: &SaveRecord) -> Result<(), AppError> {
    super::restoration::commit(connection, record)?;
    super::rewrite_apply::commit(connection, record)?;
    let preserved = match &record.effects {
        SaveEffects::None
        | SaveEffects::Resolve { .. }
        | SaveEffects::Restore { .. }
        | SaveEffects::Rewrite { .. } => None,
        SaveEffects::Accept { request } => {
            let mut batch = review_queries::batch(connection, &request.batch_id)?;
            validate_decision(&batch, &record.previous, request)?;
            let base = review_queries::base(connection, &batch)?;
            if reconstruct(&base, &batch, false)? != record.previous.content {
                return Err(conflict());
            }
            for proposal in &mut batch.proposals {
                if request
                    .proposals
                    .iter()
                    .any(|p| p.id == proposal.id && p.revision == proposal.revision)
                {
                    proposal.decision = Decision::Accepted;
                    connection.execute("UPDATE proposals SET decision='ACCEPTED' WHERE id=?1 AND revision=?2 AND batch_id=?3", params![proposal.id,proposal.revision,batch.id]).map_err(database_error)?;
                }
            }
            if reconstruct(&base, &batch, false)? != record.request.content {
                return Err(conflict());
            }
            connection
                .execute(
                    "UPDATE proposal_batches SET apply_head_id=?1 WHERE id=?2",
                    params![record.version_id, batch.id],
                )
                .map_err(database_error)?;
            Some(batch.id)
        }
    };
    connection.execute("UPDATE proposals SET validity='STALE' WHERE decision='PENDING' AND (?1 IS NULL OR batch_id!=?1) AND batch_id IN (SELECT b.id FROM proposal_batches b JOIN versions v ON b.base_version_id=v.id WHERE v.document_id=?2)", params![preserved,record.request.document_id]).map_err(database_error)?;
    Ok(())
}

pub fn task_id(connection: &Connection, effects: &SaveEffects) -> Result<Option<String>, AppError> {
    match effects {
        SaveEffects::None | SaveEffects::Resolve { .. } | SaveEffects::Restore { .. } => Ok(None),
        SaveEffects::Accept { request } => Ok(Some(
            review_queries::batch(connection, &request.batch_id)?.task_id,
        )),
        SaveEffects::Rewrite { request } => Ok(Some(
            review_queries::batch(connection, &request.batch_id)?.task_id,
        )),
    }
}
