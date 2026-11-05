use super::{
    Store,
    errors::{database_error, lock_error},
    review_queries, unit_review_state,
};
use crate::{
    document::review::stale,
    domain::{
        document::validate_id,
        error::AppError,
        unit_review::{AddUnitComment, UnitComment},
    },
};
use rusqlite::{Connection, OptionalExtension, params};

const COLUMNS: &str = "id,task_id,batch_id,plan_id,unit_id,text,status,revision,created_at";

impl Store {
    pub fn add_unit_comment(&self, request: AddUnitComment) -> Result<UnitComment, AppError> {
        request.validate()?;
        let document = review_queries::batch(&*self.connection()?, &request.batch_id)?.document_id;
        let lock = self.document_lock(&document)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let db = self.connection()?;
        if let Some(old) = comment(&db, &request.id)? {
            if old.batch_id != request.batch_id
                || old.plan_id != request.plan_id
                || old.unit_id != request.unit_id
                || old.text != request.text
            {
                return Err(AppError::invalid(
                    "같은 코멘트 ID의 대상과 내용을 변경할 수 없습니다.",
                ));
            }
            return Ok(old);
        }
        let batch = review_queries::batch(&db, &request.batch_id)?;
        unit_review_state::current(&db, &batch, None)?;
        unit_review_state::unit(&batch, &request.plan_id, &request.unit_id)?;
        db.execute("INSERT INTO unit_comments(id,task_id,batch_id,plan_id,unit_id,text,status,revision,created_at) VALUES(?1,?2,?3,?4,?5,?6,'OPEN',1,?7)",
            params![request.id,batch.task_id,request.batch_id,request.plan_id,request.unit_id,request.text,self.runtime.now_ms()?]).map_err(database_error)?;
        comment(&db, &request.id)?.ok_or_else(missing_comment)
    }

    pub fn set_unit_comment_status(
        &self,
        id: &str,
        revision: u32,
        resolved: bool,
    ) -> Result<UnitComment, AppError> {
        validate_id(id)?;
        if revision == 0 || revision == u32::MAX {
            return Err(stale());
        }
        let old = comment(&*self.connection()?, id)?.ok_or_else(missing_comment)?;
        let document = review_queries::batch(&*self.connection()?, &old.batch_id)?.document_id;
        let lock = self.document_lock(&document)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let db = self.connection()?;
        let old = comment(&db, id)?.ok_or_else(missing_comment)?;
        let batch = review_queries::batch(&db, &old.batch_id)?;
        unit_review_state::current(&db, &batch, None)?;
        unit_review_state::unit(&batch, &old.plan_id, &old.unit_id)?;
        if old.revision != revision {
            return Err(stale());
        }
        let status = if resolved { "RESOLVED" } else { "OPEN" };
        let changed = db
            .execute(
                "UPDATE unit_comments SET status=?1,revision=?2 WHERE id=?3 AND revision=?4",
                params![status, revision + 1, id, revision],
            )
            .map_err(database_error)?;
        if changed != 1 {
            return Err(stale());
        }
        comment(&db, id)?.ok_or_else(missing_comment)
    }
}

fn missing_comment() -> AppError {
    AppError::invalid("단위 코멘트를 찾을 수 없습니다.")
}

fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<UnitComment> {
    Ok(UnitComment {
        id: row.get(0)?,
        task_id: row.get(1)?,
        batch_id: row.get(2)?,
        plan_id: row.get(3)?,
        unit_id: row.get(4)?,
        text: row.get(5)?,
        status: row.get(6)?,
        revision: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub(super) fn comment(db: &Connection, id: &str) -> Result<Option<UnitComment>, AppError> {
    db.query_row(
        &format!("SELECT {COLUMNS} FROM unit_comments WHERE id=?1"),
        [id],
        read,
    )
    .optional()
    .map_err(database_error)
}

pub(super) fn for_task(db: &Connection, task: &str) -> Result<Vec<UnitComment>, AppError> {
    let mut query = db
        .prepare(&format!(
            "SELECT {COLUMNS} FROM unit_comments WHERE task_id=?1 ORDER BY created_at,id"
        ))
        .map_err(database_error)?;
    query
        .query_map([task], read)
        .map_err(database_error)?
        .collect::<rusqlite::Result<_>>()
        .map_err(database_error)
}

pub(super) fn context(db: &Connection, task: &str) -> Result<serde_json::Value, AppError> {
    let mut values = Vec::new();
    for comment in for_task(db, task)? {
        let batch = review_queries::batch(db, &comment.batch_id)?;
        let unit = unit_review_state::unit(&batch, &comment.plan_id, &comment.unit_id)?;
        let proposals = batch
            .proposals
            .iter()
            .filter(|p| p.group_id == unit.id)
            .collect::<Vec<_>>();
        values.push(serde_json::json!({"comment":comment,"target":{"title":unit.title,"number":unit.number,"reviewRevision":unit.review_revision,"batchStatus":batch.status,"proposals":proposals},"meaning":"Opinion about the whole unapproved proposal unit; not permission to apply."}));
    }
    Ok(values.into())
}
