use super::{
    Store,
    errors::{database_error, lock_error},
    journal, review_queries,
    review_register::archive_previous,
    rewrite_validation,
};
use crate::{
    document::review::stale,
    domain::{error::AppError, review::ReviewBatch, rewrite::BatchDecisionRequest},
};
use rusqlite::{Connection, params};

const SELECT: &str = "rewrite_select";
const DISCARD: &str = "batch_discard";

impl Store {
    pub fn select_rewrite(&self, request: BatchDecisionRequest) -> Result<ReviewBatch, AppError> {
        self.decide_batch(request, SELECT)
    }

    pub fn discard_batch(&self, request: BatchDecisionRequest) -> Result<ReviewBatch, AppError> {
        self.decide_batch(request, DISCARD)
    }

    fn decide_batch(
        &self,
        request: BatchDecisionRequest,
        kind: &str,
    ) -> Result<ReviewBatch, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if replay(&connection, &request, kind)? {
            return review_queries::batch(&connection, &request.batch_id);
        }
        let head = rewrite_validation::current(&connection, &request)?;
        let batch = review_queries::batch(&connection, &request.batch_id)?;
        if batch.document_id != request.document_id
            || !matches!(batch.status.as_str(), "ACTIVE" | "ARCHIVED")
        {
            return Err(stale());
        }
        if kind == SELECT {
            rewrite_validation::writable(&connection, &head)?;
            rewrite_validation::candidate(&batch, &request)?;
        }
        let transaction = connection.transaction().map_err(database_error)?;
        transition(&transaction, &batch, kind)?;
        self.insert_batch_event(&transaction, &request, &batch.task_id, kind)?;
        transaction.commit().map_err(database_error)?;
        review_queries::batch(&connection, &batch.id)
    }

    fn insert_batch_event(
        &self,
        connection: &Connection,
        request: &BatchDecisionRequest,
        task: &str,
        kind: &str,
    ) -> Result<(), AppError> {
        let payload = serde_json::to_string(request)
            .map_err(|_| AppError::invalid("후보 결정을 저장할 수 없습니다."))?;
        let sequence = super::queries::next_sequence(connection)?;
        connection.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)", params![request.operation_id,request.document_id,task,sequence,kind,payload,request.expected_head_id,self.runtime.now_ms()?]).map_err(database_error)?;
        Ok(())
    }
}

fn transition(connection: &Connection, batch: &ReviewBatch, kind: &str) -> Result<(), AppError> {
    if kind == SELECT {
        archive_previous(connection, &batch.task_id, &batch.id)?;
        connection
            .execute(
                "UPDATE proposal_batches SET status='ACTIVE' WHERE id=?1",
                [&batch.id],
            )
            .map_err(database_error)?;
    } else {
        connection
            .execute(
                "UPDATE proposal_batches SET status='DISCARDED' WHERE id=?1",
                [&batch.id],
            )
            .map_err(database_error)?;
        connection.execute("UPDATE proposals SET decision='DISCARDED' WHERE batch_id=?1 AND decision='PENDING'", [&batch.id]).map_err(database_error)?;
    }
    Ok(())
}

fn replay(
    connection: &Connection,
    request: &BatchDecisionRequest,
    kind: &str,
) -> Result<bool, AppError> {
    if journal::saved_record(connection, &request.operation_id)?.is_some() {
        return Err(AppError::invalid("이미 사용한 저장 ID입니다."));
    }
    let Some((old_kind, payload)) = rewrite_validation::event(connection, &request.operation_id)?
    else {
        return Ok(false);
    };
    let previous: BatchDecisionRequest = serde_json::from_str(&payload)
        .map_err(|_| AppError::invalid("이미 사용한 결정 ID입니다."))?;
    if old_kind != kind || previous != *request {
        return Err(AppError::invalid(
            "같은 결정 ID의 내용을 변경할 수 없습니다.",
        ));
    }
    Ok(true)
}
