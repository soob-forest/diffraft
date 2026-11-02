use super::{
    Store,
    errors::{database_error, lock_error},
    files,
    job_lifecycle::require_running,
    review_queries, selection_context, selection_source,
};
use crate::domain::{
    error::{AppError, ErrorCode},
    review::{ReviewBatch, ReviewJob},
    selection_request::{PreparedSelection, SelectionRequest},
};
use rusqlite::{Connection, OptionalExtension, params};

impl Store {
    pub fn prepare_selection_request(
        &self,
        mut request: SelectionRequest,
    ) -> Result<PreparedSelection, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let db = self.connection()?;
        let source = selection_source::source(&db, &request)?;
        let context = match retry_context(&db, &request)? {
            Some(frozen) => frozen,
            None => selection_context::build(&db, &request, &source)?,
        };
        request.context_hash = Some(files::content_hash(&context));
        Ok(PreparedSelection { request, context })
    }
    pub fn begin_selection_request(
        &self,
        request: SelectionRequest,
    ) -> Result<ReviewJob, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut db = self.connection()?;
        if let Some(job) = replay(&db, &request)? {
            return Ok(job);
        }
        if review_queries::active_job(&db)? {
            return Err(AppError::new(
                ErrorCode::Busy,
                "이미 생성 중인 요청이 있습니다.",
            ));
        }
        let source = selection_source::source(&db, &request)?;
        let context = match retry_context(&db, &request)? {
            Some(frozen) => frozen,
            None => selection_context::build(&db, &request, &source)?,
        };
        if request.context_hash.as_deref() != Some(files::content_hash(&context).as_str()) {
            return Err(AppError::invalid(
                "선택 기준이나 전달 문맥이 변경되었습니다. 요청 내용을 다시 확인해 주세요.",
            ));
        }
        let scope = serde_json::to_string(&source.scope).map_err(|_| invalid())?;
        let json = serde_json::to_string(&request).map_err(|_| invalid())?;
        let job = ReviewJob {
            id: request.operation_id.clone(),
            attempt_id: self.runtime.id(),
        };
        let tx = db.transaction().map_err(database_error)?;
        tx.execute("INSERT INTO jobs(id,task_id,attempt_id,base_version_id,scope_json,status,created_at) VALUES(?1,?2,?3,?4,?5,'RUNNING',?6)",params![job.id,request.task_id,job.attempt_id,source.head.version_id,scope,self.runtime.now_ms()?]).map_err(database_error)?;
        tx.execute(
            "INSERT INTO selection_jobs(job_id,request_json,context_json) VALUES(?1,?2,?3)",
            params![job.id, json, context],
        )
        .map_err(database_error)?;
        tx.commit().map_err(database_error)?;
        Ok(job)
    }
    pub fn selection_job_context(&self, job: &ReviewJob) -> Result<String, AppError> {
        let db = self.connection()?;
        require_running(&db, job)?;
        db.query_row(
            "SELECT context_json FROM selection_jobs WHERE job_id=?1",
            [&job.id],
            |row| row.get(0),
        )
        .map_err(database_error)
    }
    pub fn completed_selection_request(
        &self,
        job: &ReviewJob,
    ) -> Result<Option<ReviewBatch>, AppError> {
        let db = self.connection()?;
        let id:Option<String>=db.query_row("SELECT b.id FROM proposal_batches b JOIN jobs j ON j.id=b.job_id JOIN selection_jobs s ON s.job_id=j.id WHERE j.id=?1 AND j.attempt_id=?2 AND j.status='SUCCEEDED'",params![job.id,job.attempt_id],|row|row.get(0)).optional().map_err(database_error)?;
        id.map(|id| review_queries::batch(&db, &id)).transpose()
    }
}
pub(super) fn saved_request(
    db: &Connection,
    job: &ReviewJob,
) -> Result<SelectionRequest, AppError> {
    require_running(db, job)?;
    let json: String = db
        .query_row(
            "SELECT request_json FROM selection_jobs WHERE job_id=?1",
            [&job.id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    serde_json::from_str(&json).map_err(|_| invalid())
}
fn replay(db: &Connection, request: &SelectionRequest) -> Result<Option<ReviewJob>, AppError> {
    let previous:Option<(String,String,String)>=db.query_row("SELECT s.request_json,j.attempt_id,j.status FROM selection_jobs s JOIN jobs j ON j.id=s.job_id WHERE j.id=?1",[&request.operation_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).optional().map_err(database_error)?;
    let Some((json, attempt_id, status)) = previous else {
        return Ok(None);
    };
    let saved: SelectionRequest = serde_json::from_str(&json).map_err(|_| invalid())?;
    if saved != *request {
        return Err(invalid());
    }
    if !matches!(status.as_str(), "RUNNING" | "SUCCEEDED") {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "종료된 요청입니다. 새 시도로 다시 요청해 주세요.",
        ));
    }
    Ok(Some(ReviewJob {
        id: request.operation_id.clone(),
        attempt_id,
    }))
}
fn retry_context(db: &Connection, request: &SelectionRequest) -> Result<Option<String>, AppError> {
    let Some(previous) = &request.retry_of else {
        return Ok(None);
    };
    super::generation_execution::verify_retry(db, &request.task_id, Some(previous))?;
    let (json, context): (String, String) = db
        .query_row(
            "SELECT request_json,context_json FROM selection_jobs WHERE job_id=?1",
            [previous],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(database_error)?;
    let mut saved: SelectionRequest = serde_json::from_str(&json).map_err(|_| invalid())?;
    saved.operation_id = request.operation_id.clone();
    saved.retry_of = request.retry_of.clone();
    if saved != *request {
        return Err(invalid());
    }
    Ok(Some(context))
}
fn invalid() -> AppError {
    AppError::invalid("저장된 선택 요청과 대상·모델·지시가 일치하지 않습니다.")
}
