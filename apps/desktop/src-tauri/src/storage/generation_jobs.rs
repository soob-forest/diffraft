use super::{
    Store,
    errors::{database_error, lock_error},
    generation_context,
    job_lifecycle::require_running,
    review_queries,
};
use crate::domain::{
    error::{AppError, ErrorCode},
    generation::GenerateRequest,
    review::ReviewJob,
};
use rusqlite::{Connection, OptionalExtension, params};

impl Store {
    pub fn begin_generation(&self, request: GenerateRequest) -> Result<ReviewJob, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        let json = serde_json::to_string(&request)
            .map_err(|_| AppError::invalid("요청을 저장할 수 없습니다."))?;
        if let Some(job) = replay(&connection, &request.operation_id, &json)? {
            return Ok(job);
        }
        if review_queries::active_job(&connection)? {
            return Err(AppError::new(
                ErrorCode::Busy,
                "이미 생성 중인 요청이 있습니다.",
            ));
        }
        let (head, scope) = generation_context::source(&connection, &request)?;
        let context = generation_context::build(&connection, &request, &head, &scope)?;
        let scope = serde_json::to_string(&scope)
            .map_err(|_| AppError::invalid("요청 범위를 저장할 수 없습니다."))?;
        let job = ReviewJob {
            id: request.operation_id,
            attempt_id: self.runtime.id(),
        };
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO jobs(id,task_id,attempt_id,base_version_id,scope_json,status,created_at) VALUES(?1,?2,?3,?4,?5,'RUNNING',?6)",params![job.id,request.task_id,job.attempt_id,head.version_id,scope,self.runtime.now_ms()?]).map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO generation_jobs(job_id,request_json,context_json) VALUES(?1,?2,?3)",
                params![job.id, json, context],
            )
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(job)
    }

    pub fn generation_context(&self, job: &ReviewJob) -> Result<String, AppError> {
        let connection = self.connection()?;
        require_running(&connection, job)?;
        connection
            .query_row(
                "SELECT context_json FROM generation_jobs WHERE job_id=?1",
                [&job.id],
                |row| row.get(0),
            )
            .map_err(database_error)
    }
}

fn replay(connection: &Connection, id: &str, request: &str) -> Result<Option<ReviewJob>, AppError> {
    let row:Option<(String,String,String)> = connection.query_row("SELECT g.request_json,j.attempt_id,j.status FROM generation_jobs g JOIN jobs j ON g.job_id=j.id WHERE j.id=?1",[id],|row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).optional().map_err(database_error)?;
    let Some((previous, attempt_id, status)) = row else {
        return Ok(None);
    };
    // Apply legacy defaults using the same request contract, without rewriting history.
    let previous: GenerateRequest = serde_json::from_str(&previous)
        .map_err(|_| AppError::invalid("생성 요청 기록을 읽을 수 없습니다."))?;
    let previous = serde_json::to_string(&previous)
        .map_err(|_| AppError::invalid("생성 요청 기록을 비교할 수 없습니다."))?;
    if previous != request {
        return Err(AppError::invalid(
            "같은 요청 ID로 내용을 변경할 수 없습니다.",
        ));
    }
    if !matches!(status.as_str(), "RUNNING" | "SUCCEEDED") {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "종료된 요청입니다. 새 요청으로 다시 시도해 주세요.",
        ));
    }
    Ok(Some(ReviewJob {
        id: id.into(),
        attempt_id,
    }))
}
