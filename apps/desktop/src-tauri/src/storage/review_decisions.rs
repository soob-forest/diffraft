use super::{
    Store,
    errors::{conflict, database_error, lock_error},
    files, journal,
    models::{SaveEffects, SaveReason, SaveRecord, SaveRequest},
    queries, review_queries,
};
use crate::{
    document::review::{reconstruct, stale, valid_head, validate_decision},
    domain::{
        document::{DocumentSnapshot, DocumentStatus},
        error::{AppError, ErrorCode},
        review::{Decision, DecisionRequest, ReviewBatch},
    },
};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

impl Store {
    pub fn accept_proposals(&self, request: DecisionRequest) -> Result<DocumentSnapshot, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if replay_accept(&connection, &request)? {
            return queries::snapshot(&connection, &request.document_id);
        }
        let previous = current_for_decision(&connection, &request)?;
        let mut batch = review_queries::batch(&connection, &request.batch_id)?;
        let base = review_queries::base(&connection, &batch)?;
        valid_head(&base, &batch, &previous)?;
        validate_decision(&batch, &previous, &request)?;
        for proposal in &mut batch.proposals {
            if request.proposals.iter().any(|p| p.id == proposal.id) {
                proposal.decision = Decision::Accepted;
            }
        }
        let content = reconstruct(&base, &batch, false)?;
        let record = self.accept_record(request, previous, content)?;
        self.write_record(&mut connection, &record)?;
        queries::snapshot(&connection, &record.request.document_id)
    }

    fn accept_record(
        &self,
        request: DecisionRequest,
        previous: DocumentSnapshot,
        content: String,
    ) -> Result<SaveRecord, AppError> {
        Ok(SaveRecord {
            new_hash: files::content_hash(&content),
            request: SaveRequest {
                document_id: request.document_id.clone(),
                expected_version: previous.version,
                content,
                operation_id: request.operation_id.clone(),
                reason: SaveReason::Accept,
            },
            previous,
            version_id: self.runtime.id(),
            event_id: self.runtime.id(),
            created_at: self.runtime.now_ms()?,
            effects: SaveEffects::Accept { request },
        })
    }

    pub fn reject_proposals(&self, request: DecisionRequest) -> Result<ReviewBatch, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if replay_reject(&connection, &request)? {
            return review_queries::batch(&connection, &request.batch_id);
        }
        let head = current_for_decision(&connection, &request)?;
        let batch = review_queries::batch(&connection, &request.batch_id)?;
        valid_head(&review_queries::base(&connection, &batch)?, &batch, &head)?;
        validate_decision(&batch, &head, &request)?;
        let payload = serde_json::to_string(&request)
            .map_err(|_| AppError::invalid("결정을 저장할 수 없습니다."))?;
        let transaction = connection.transaction().map_err(database_error)?;
        for revision in &request.proposals {
            transaction.execute("UPDATE proposals SET decision='REJECTED' WHERE id=?1 AND revision=?2 AND batch_id=?3", params![revision.id,revision.revision,batch.id]).map_err(database_error)?;
        }
        let sequence = queries::next_sequence(&transaction)?;
        transaction.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,'reject',?5,?6,?7)", params![request.operation_id,head.id,batch.task_id,sequence,payload,head.version_id,self.runtime.now_ms()?]).map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        review_queries::batch(&connection, &batch.id)
    }
}

fn current_for_decision(
    connection: &Connection,
    request: &DecisionRequest,
) -> Result<DocumentSnapshot, AppError> {
    if review_queries::active_job(connection)? {
        return Err(AppError::new(
            ErrorCode::Busy,
            "생성 중에는 제안을 승인하거나 거절할 수 없습니다.",
        ));
    }
    let head = queries::snapshot(connection, &request.document_id)?;
    if head.status != DocumentStatus::Ready {
        return Err(conflict());
    }
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    if let Err(error) = files::verify_hash(Path::new(&head.path), &head.content_hash) {
        queries::set_status(connection, &head.id, "CONFLICT")?;
        return Err(error);
    }
    Ok(head)
}

fn replay_accept(connection: &Connection, request: &DecisionRequest) -> Result<bool, AppError> {
    if let Some((phase, record)) = journal::saved_record(connection, &request.operation_id)? {
        if record.effects
            != (SaveEffects::Accept {
                request: request.clone(),
            })
        {
            return Err(AppError::invalid(
                "이미 사용한 작업 ID의 승인 내용을 변경할 수 없습니다.",
            ));
        }
        if phase != "COMMITTED" {
            return Err(conflict());
        }
        return Ok(true);
    }
    if rejected_event(connection, &request.operation_id)?.is_some() {
        return Err(AppError::invalid("이미 사용한 결정 ID입니다."));
    }
    Ok(false)
}

fn replay_reject(connection: &Connection, request: &DecisionRequest) -> Result<bool, AppError> {
    if journal::saved_record(connection, &request.operation_id)?.is_some() {
        return Err(AppError::invalid("이미 사용한 저장 ID입니다."));
    }
    let Some((kind, payload)) = rejected_event(connection, &request.operation_id)? else {
        return Ok(false);
    };
    let old: DecisionRequest = serde_json::from_str(&payload)
        .map_err(|_| AppError::invalid("이미 사용한 결정 ID입니다."))?;
    if kind != "reject" || old != *request {
        return Err(AppError::invalid(
            "이미 사용한 결정 ID의 내용을 변경할 수 없습니다.",
        ));
    }
    Ok(true)
}

fn rejected_event(connection: &Connection, id: &str) -> Result<Option<(String, String)>, AppError> {
    connection
        .query_row(
            "SELECT kind,payload FROM decision_events WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)
}
