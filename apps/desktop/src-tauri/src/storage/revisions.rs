use super::{
    Store, comment_links,
    errors::{conflict, database_error, lock_error},
    files, journal, queries, review_queries,
};
use crate::{
    document::{patch::requires_dependency_group, review::valid_head, revisions::revise},
    domain::{
        annotations::RevisionRequest,
        document::{validate_content, validate_id},
        error::{AppError, ErrorCode},
        review::{Decision, Proposal, ReviewBatch},
    },
};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

impl Store {
    pub fn save_proposal_revision(
        &self,
        request: RevisionRequest,
    ) -> Result<ReviewBatch, AppError> {
        validate(&request)?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if replay(&connection, &request)? {
            return review_queries::batch(&connection, &request.batch_id);
        }
        if review_queries::active_job(&connection)? {
            return Err(AppError::new(
                ErrorCode::Busy,
                "생성 중에는 후보를 직접 수정할 수 없습니다.",
            ));
        }
        let head = queries::snapshot(&connection, &request.document_id)?;
        let mut batch = review_queries::batch(&connection, &request.batch_id)?;
        let base = review_queries::base(&connection, &batch)?;
        valid_head(&base, &batch, &head)?;
        if head.version_id != request.expected_head_id {
            return Err(crate::document::review::stale());
        }
        if files::verify_hash(Path::new(&head.path), &head.content_hash).is_err() {
            queries::set_status(&connection, &head.id, "CONFLICT")?;
            return Err(conflict());
        }
        let scope = review_queries::scope(&connection, &batch.id)?;
        let proposal = revise(&base, &scope, &mut batch, &request)?;
        let transaction = connection.transaction().map_err(database_error)?;
        self.persist_revision(&transaction, &batch, &proposal, &request)?;
        transaction.commit().map_err(database_error)?;
        review_queries::batch(&connection, &batch.id)
    }

    pub(super) fn persist_revision(
        &self,
        connection: &Connection,
        batch: &ReviewBatch,
        proposal: &Proposal,
        request: &RevisionRequest,
    ) -> Result<(), AppError> {
        insert_revision(connection, batch, proposal, self.runtime.now_ms()?)?;
        self.regroup(connection, batch)?;
        comment_links::update(connection, batch, proposal)?;
        let payload = serde_json::to_string(request)
            .map_err(|_| AppError::invalid("후보 수정 기록을 저장할 수 없습니다."))?;
        let sequence = queries::next_sequence(connection)?;
        connection.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,'proposal_revision',?5,?6,?7)", params![request.operation_id,request.document_id,batch.task_id,sequence,payload,request.expected_head_id,self.runtime.now_ms()?]).map_err(database_error)?;
        Ok(())
    }

    fn regroup(&self, connection: &Connection, batch: &ReviewBatch) -> Result<(), AppError> {
        let operations: Vec<_> = batch
            .proposals
            .iter()
            .filter(|p| p.decision == Decision::Pending)
            .map(|p| p.operation.clone())
            .collect();
        if requires_dependency_group(&operations) {
            connection
                .execute(
                    "UPDATE proposals SET group_id=?1 WHERE batch_id=?2 AND decision='PENDING'",
                    params![self.runtime.id(), batch.id],
                )
                .map_err(database_error)?;
        }
        Ok(())
    }
}

fn insert_revision(
    connection: &Connection,
    batch: &ReviewBatch,
    proposal: &Proposal,
    now: i64,
) -> Result<(), AppError> {
    let json = serde_json::to_string(&proposal.operation)
        .map_err(|_| AppError::invalid("후보 범위를 저장할 수 없습니다."))?;
    connection.execute("UPDATE proposals SET decision='SUPERSEDED' WHERE id=?1 AND revision=?2 AND batch_id=?3 AND decision='PENDING'", params![proposal.id,proposal.revision-1,batch.id]).map_err(database_error)?;
    connection.execute("INSERT INTO proposals(id,batch_id,revision,group_id,block_anchor,before_text,after_text,reason,decision,validity,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'PENDING','VALID',?9)", params![proposal.id,batch.id,proposal.revision,proposal.group_id,json,proposal.operation.before,proposal.operation.after,proposal.operation.reason,now]).map_err(database_error)?;
    Ok(())
}

fn validate(request: &RevisionRequest) -> Result<(), AppError> {
    for id in [
        &request.document_id,
        &request.batch_id,
        &request.proposal_id,
        &request.expected_head_id,
        &request.operation_id,
    ] {
        validate_id(id)?;
    }
    if request.expected_revision == 0 {
        return Err(AppError::invalid("제안 revision이 올바르지 않습니다."));
    }
    validate_content(&request.after)
}

fn replay(connection: &Connection, request: &RevisionRequest) -> Result<bool, AppError> {
    if journal::saved_record(connection, &request.operation_id)?.is_some() {
        return Err(AppError::invalid("이미 사용한 저장 ID입니다."));
    }
    let row: Option<(String, String)> = connection
        .query_row(
            "SELECT kind,payload FROM decision_events WHERE id=?1",
            [&request.operation_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let Some((kind, json)) = row else {
        return Ok(false);
    };
    let old: RevisionRequest =
        serde_json::from_str(&json).map_err(|_| AppError::invalid("이미 사용한 결정 ID입니다."))?;
    if kind != "proposal_revision" || old != *request {
        return Err(AppError::invalid(
            "이미 사용한 결정 ID로 다른 후보를 저장할 수 없습니다.",
        ));
    }
    Ok(true)
}
