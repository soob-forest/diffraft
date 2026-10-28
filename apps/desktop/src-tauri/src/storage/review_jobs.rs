use super::{
    Store,
    errors::{database_error, lock_error},
    files, queries, review_queries,
};
use crate::{
    document::scope::select,
    domain::{
        document::{DocumentStatus, validate_id},
        editor::ScopeSelection,
        error::{AppError, ErrorCode},
        review::ReviewJob,
    },
};
use rusqlite::params;
use std::path::Path;

pub struct BeginReviewJob {
    pub document_id: String,
    pub task_id: String,
    pub expected_version: u32,
    pub selection: ScopeSelection,
}

impl Store {
    pub fn begin_review_job(&self, request: BeginReviewJob) -> Result<ReviewJob, AppError> {
        validate_id(&request.task_id)?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let connection = self.connection()?;
        let head = queries::snapshot(&connection, &request.document_id)?;
        if head.status != DocumentStatus::Ready || head.version != request.expected_version {
            return Err(crate::document::review::stale());
        }
        if let Err(error) = files::verify_hash(Path::new(&head.path), &head.content_hash) {
            queries::set_status(&connection, &head.id, "CONFLICT")?;
            return Err(error);
        }
        let belongs: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?1 AND document_id=?2)",
                params![request.task_id, head.id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        if !belongs {
            return Err(AppError::invalid("이 문서의 작업을 선택해 주세요."));
        }
        if review_queries::active_job(&connection)? {
            return Err(AppError::new(
                ErrorCode::Busy,
                "이미 생성 중인 요청이 있습니다. 완료하거나 중단한 뒤 요청해 주세요.",
            ));
        }
        let scope = select(&head, request.selection)?;
        let scope_json = serde_json::to_string(&scope)
            .map_err(|_| AppError::invalid("요청 범위를 저장할 수 없습니다."))?;
        let job = ReviewJob {
            id: self.runtime.id(),
            attempt_id: self.runtime.id(),
        };
        connection.execute("INSERT INTO jobs(id,task_id,attempt_id,base_version_id,scope_json,status,created_at) VALUES(?1,?2,?3,?4,?5,'RUNNING',?6)", params![job.id,request.task_id,job.attempt_id,head.version_id,scope_json,self.runtime.now_ms()?]).map_err(database_error)?;
        Ok(job)
    }

    pub fn review_batch(&self, id: &str) -> Result<crate::domain::review::ReviewBatch, AppError> {
        validate_id(id)?;
        review_queries::batch(&*self.connection()?, id)
    }
}
