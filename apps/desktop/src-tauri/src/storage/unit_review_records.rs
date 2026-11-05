use super::{errors::database_error, files, journal, queries, runtime::Runtime};
use crate::{
    document::rewrite_plan::{ALGORITHM_VERSION, PlannedUnit},
    domain::{
        error::AppError,
        review::{EditOperation, ReviewBatch},
    },
};
use rusqlite::{Connection, OptionalExtension, params};

pub(super) const START_EVENT: &str = "rewrite_review_started";
pub(super) const REOPEN_EVENT: &str = "review_unit_reopened";

pub(super) fn payload(value: &impl serde::Serialize) -> Result<String, AppError> {
    serde_json::to_string(value).map_err(|_| AppError::invalid("검토 요청을 저장할 수 없습니다."))
}

pub(super) fn replay(
    db: &Connection,
    id: &str,
    kind: &str,
    expected: &str,
) -> Result<bool, AppError> {
    if journal::saved_record(db, id)?.is_some() {
        return Err(AppError::invalid("이미 사용한 저장 ID입니다."));
    }
    let previous: Option<(String, String)> = db
        .query_row(
            "SELECT kind,payload FROM decision_events WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let Some((old_kind, old_payload)) = previous else {
        return Ok(false);
    };
    if old_kind != kind || old_payload != expected {
        return Err(AppError::invalid(
            "같은 작업 ID의 검토 요청을 변경할 수 없습니다.",
        ));
    }
    Ok(true)
}

pub(super) fn event(
    db: &Connection,
    batch: &ReviewBatch,
    id: &str,
    data: (&str, &str),
    now: i64,
) -> Result<(), AppError> {
    db.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![id,batch.document_id,batch.task_id,queries::next_sequence(db)?,data.0,data.1,batch.apply_head_id,now]).map_err(database_error)?;
    Ok(())
}

pub(super) struct ProposalRecord<'a> {
    pub id: &'a str,
    pub batch: &'a str,
    pub group: &'a str,
    pub revision: u32,
    pub created_at: i64,
}

pub(super) fn proposal(
    db: &Connection,
    record: ProposalRecord<'_>,
    operation: &EditOperation,
) -> Result<(), AppError> {
    db.execute("INSERT INTO proposals(id,batch_id,revision,group_id,block_anchor,before_text,after_text,reason,decision,validity,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'PENDING','VALID',?9)",
        params![record.id,record.batch,record.revision,record.group,payload(operation)?,operation.before,operation.after,operation.reason,record.created_at]).map_err(database_error)?;
    Ok(())
}

pub(super) fn plan(
    db: &Connection,
    runtime: &dyn Runtime,
    batch: &ReviewBatch,
    units: &[PlannedUnit],
) -> Result<(), AppError> {
    let id = runtime.id();
    let now = runtime.now_ms()?;
    let candidate = batch
        .candidate_markdown
        .as_ref()
        .ok_or_else(super::unit_review_queries::invalid_plan)?;
    db.execute("INSERT INTO review_plans(id,batch_id,base_version_id,candidate_hash,algorithm_version,created_at) VALUES(?1,?2,?3,?4,?5,?6)",
        params![id,batch.id,batch.base_version_id,files::content_hash(candidate),ALGORITHM_VERSION,now]).map_err(database_error)?;
    for (i, unit) in units.iter().enumerate() {
        let unit_id = runtime.id();
        db.execute("INSERT INTO review_units(id,batch_id,plan_id,number,title,kind,reason,review_revision) VALUES(?1,?2,?3,?4,?5,?6,?7,1)",
            params![unit_id,batch.id,id,(i+1) as u32,unit.title,unit.kind,unit.reason]).map_err(database_error)?;
        for operation in &unit.operations {
            proposal(
                db,
                ProposalRecord {
                    id: &runtime.id(),
                    batch: &batch.id,
                    group: &unit_id,
                    revision: 1,
                    created_at: now,
                },
                operation,
            )?;
        }
    }
    db.execute(
        "UPDATE proposal_batches SET review_mode='CHANGES' WHERE id=?1 AND review_mode='WHOLE'",
        [&batch.id],
    )
    .map_err(database_error)?;
    Ok(())
}
