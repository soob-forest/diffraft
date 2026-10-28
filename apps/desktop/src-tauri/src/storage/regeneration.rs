use super::{
    Store,
    errors::{database_error, lock_error},
    job_lifecycle::require_running,
    regeneration_context, review_queries,
};
use crate::{
    document::scope::select,
    domain::{
        editor::ScopeSelection,
        error::{AppError, ErrorCode},
        regeneration::RegenerateRequest,
        review::{ReviewBatch, ReviewJob},
    },
};
use rusqlite::{Connection, OptionalExtension, params};

impl Store {
    pub fn begin_regeneration(&self, request: RegenerateRequest) -> Result<ReviewJob, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        if let Some(job) = replay(&connection, &request)? {
            return Ok(job);
        }
        if review_queries::active_job(&connection)? {
            return Err(AppError::new(
                ErrorCode::Busy,
                "이미 생성 중인 요청이 있습니다.",
            ));
        }
        let target = regeneration_context::target(&connection, &request)?;
        let context = regeneration_context::context(&connection, &request, &target)?;
        let scope = serde_json::to_string(&select(&target.0, ScopeSelection::Whole)?)
            .map_err(|_| AppError::invalid("재제안 범위를 저장할 수 없습니다."))?;
        let json = serde_json::to_string(&request)
            .map_err(|_| AppError::invalid("재제안 요청을 저장할 수 없습니다."))?;
        let job = ReviewJob {
            id: request.operation_id,
            attempt_id: self.runtime.id(),
        };
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO jobs(id,task_id,attempt_id,base_version_id,scope_json,status,created_at) VALUES(?1,?2,?3,?4,?5,'RUNNING',?6)", params![job.id,target.1.task_id,job.attempt_id,target.0.version_id,scope,self.runtime.now_ms()?]).map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO revision_jobs(job_id,request_json,context_json) VALUES(?1,?2,?3)",
                params![job.id, json, context],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(job)
    }

    pub fn regeneration_context(&self, job: &ReviewJob) -> Result<String, AppError> {
        let connection = self.connection()?;
        require_running(&connection, job)?;
        connection
            .query_row(
                "SELECT context_json FROM revision_jobs WHERE job_id=?1",
                [&job.id],
                |row| row.get(0),
            )
            .map_err(database_error)
    }

    pub fn completed_regeneration(&self, job: &ReviewJob) -> Result<Option<ReviewBatch>, AppError> {
        let connection = self.connection()?;
        let row: Option<(String,String)> = connection.query_row(
            "SELECT j.status,r.request_json FROM jobs j JOIN revision_jobs r ON j.id=r.job_id WHERE j.id=?1 AND j.attempt_id=?2",
            params![job.id,job.attempt_id], |row| Ok((row.get(0)?,row.get(1)?)),
        ).optional().map_err(database_error)?;
        let Some((status, json)) = row else {
            return Ok(None);
        };
        if status != "SUCCEEDED" {
            return Ok(None);
        }
        let request: RegenerateRequest = serde_json::from_str(&json)
            .map_err(|_| AppError::invalid("재제안 기록을 읽을 수 없습니다."))?;
        review_queries::batch(&connection, &request.batch_id).map(Some)
    }
}

fn replay(
    connection: &Connection,
    request: &RegenerateRequest,
) -> Result<Option<ReviewJob>, AppError> {
    let row: Option<(String,String,String)> = connection.query_row(
        "SELECT r.request_json,j.attempt_id,j.status FROM revision_jobs r JOIN jobs j ON r.job_id=j.id WHERE j.id=?1",
        [&request.operation_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).optional().map_err(database_error)?;
    let Some((json, attempt_id, status)) = row else {
        return Ok(None);
    };
    let previous: RegenerateRequest = serde_json::from_str(&json)
        .map_err(|_| AppError::invalid("재제안 기록을 읽을 수 없습니다."))?;
    if previous != *request {
        return Err(AppError::invalid(
            "같은 요청 ID로 재제안 대상을 변경할 수 없습니다.",
        ));
    }
    if !matches!(status.as_str(), "RUNNING" | "SUCCEEDED") {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "종료된 요청입니다. 새 요청으로 다시 시도해 주세요.",
        ));
    }
    Ok(Some(ReviewJob {
        id: request.operation_id.clone(),
        attempt_id,
    }))
}
