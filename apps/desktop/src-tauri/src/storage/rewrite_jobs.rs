use super::{
    Store,
    errors::{database_error, lock_error},
    job_lifecycle::require_running,
    queries, review_queries,
    rewrite_context::{self, RewriteTarget},
};
use crate::{
    document::scope::select,
    domain::{
        editor::ScopeSelection,
        error::{AppError, ErrorCode},
        review::{ReviewBatch, ReviewJob},
        rewrite::RewriteRequest,
    },
};
use rusqlite::{Connection, OptionalExtension, params};

impl Store {
    pub fn begin_rewrite(&self, request: RewriteRequest) -> Result<ReviewJob, AppError> {
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
        let target = rewrite_context::target(&connection, &request)?;
        self.insert_rewrite_job(&mut connection, &request, target)
    }

    fn insert_rewrite_job(
        &self,
        connection: &mut Connection,
        request: &RewriteRequest,
        target: RewriteTarget,
    ) -> Result<ReviewJob, AppError> {
        let scope = serde_json::to_string(&select(&target.head, ScopeSelection::Whole)?)
            .map_err(|_| AppError::invalid("재작성 범위를 저장할 수 없습니다."))?;
        let json = serde_json::to_string(request)
            .map_err(|_| AppError::invalid("재작성 요청을 저장할 수 없습니다."))?;
        let job = ReviewJob {
            id: request.operation_id.clone(),
            attempt_id: self.runtime.id(),
        };
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO jobs(id,task_id,attempt_id,base_version_id,scope_json,status,created_at) VALUES(?1,?2,?3,?4,?5,'RUNNING',?6)", params![job.id,request.task_id,job.attempt_id,target.head.version_id,scope,self.runtime.now_ms()?]).map_err(database_error)?;
        transaction
            .execute(
                "INSERT INTO rewrite_jobs(job_id,request_json,context_json) VALUES(?1,?2,?3)",
                params![job.id, json, target.context],
            )
            .map_err(database_error)?;
        if let Some(batch) = target.active_patch {
            transaction
                .execute(
                    "UPDATE proposal_batches SET status='ARCHIVED' WHERE id=?1",
                    [batch],
                )
                .map_err(database_error)?;
        }
        let sequence = queries::next_sequence(&transaction)?;
        transaction.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,'rewrite_requested',?5,?6,?7)", params![self.runtime.id(),request.document_id,request.task_id,sequence,json,request.expected_head_id,self.runtime.now_ms()?]).map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(job)
    }

    pub fn rewrite_context(&self, job: &ReviewJob) -> Result<String, AppError> {
        let connection = self.connection()?;
        require_running(&connection, job)?;
        connection
            .query_row(
                "SELECT context_json FROM rewrite_jobs WHERE job_id=?1",
                [&job.id],
                |row| row.get(0),
            )
            .map_err(database_error)
    }

    pub fn completed_rewrite(&self, job: &ReviewJob) -> Result<Option<ReviewBatch>, AppError> {
        let connection = self.connection()?;
        let id: Option<String> = connection.query_row(
            "SELECT b.id FROM proposal_batches b JOIN jobs j ON b.job_id=j.id JOIN rewrite_jobs r ON r.job_id=j.id WHERE j.id=?1 AND j.attempt_id=?2 AND j.status='SUCCEEDED' AND b.mode='REWRITE'",
            params![job.id,job.attempt_id], |row| row.get(0),
        ).optional().map_err(database_error)?;
        id.map(|id| review_queries::batch(&connection, &id))
            .transpose()
    }
}

fn replay(
    connection: &Connection,
    request: &RewriteRequest,
) -> Result<Option<ReviewJob>, AppError> {
    let row: Option<(String,String,String)> = connection.query_row(
        "SELECT r.request_json,j.attempt_id,j.status FROM rewrite_jobs r JOIN jobs j ON r.job_id=j.id WHERE j.id=?1",
        [&request.operation_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).optional().map_err(database_error)?;
    let Some((json, attempt_id, status)) = row else {
        return Ok(None);
    };
    let previous: RewriteRequest = serde_json::from_str(&json)
        .map_err(|_| AppError::invalid("재작성 요청 기록을 읽을 수 없습니다."))?;
    if previous != *request {
        return Err(AppError::invalid(
            "같은 요청 ID의 재작성 대상을 변경할 수 없습니다.",
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
