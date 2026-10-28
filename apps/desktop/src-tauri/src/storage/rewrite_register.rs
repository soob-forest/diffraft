use super::{
    Store,
    errors::{database_error, lock_error},
    files, queries, review_queries,
    review_register::{archive_previous, job_source},
};
use crate::domain::{
    ai::AiResponse,
    document::{validate_content, validate_id},
    error::AppError,
    review::{ReviewBatch, ReviewJob},
};
use rusqlite::params;
use std::path::Path;

impl Store {
    pub fn register_rewrite(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
    ) -> Result<ReviewBatch, AppError> {
        self.register_rewrite_result(job, response, None)
    }

    pub fn complete_rewrite(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: &str,
    ) -> Result<ReviewBatch, AppError> {
        self.register_rewrite_result(job, response, Some(session))
    }

    fn register_rewrite_result(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: Option<&str>,
    ) -> Result<ReviewBatch, AppError> {
        validate_id(&job.id)?;
        validate_id(&job.attempt_id)?;
        require_rewrite_job(&*self.connection()?, job)?;
        response.validate()?;
        let AiResponse::Rewrite {
            summary,
            candidate_markdown,
            ..
        } = response
        else {
            return Err(AppError::invalid("전체 재작성 응답이 필요합니다."));
        };
        validate_content(candidate_markdown)?;
        let source = job_source(&*self.connection()?, job)?;
        if source.scope.from != 0 || source.scope.to as usize != source.base.len() {
            return Err(AppError::invalid(
                "전체 재작성은 문서 전체 범위에서만 요청할 수 있습니다.",
            ));
        }
        let lock = self.document_lock(&source.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        job_source(&connection, job)?;
        let head = queries::snapshot(&connection, &source.document_id)?;
        if files::verify_hash(Path::new(&head.path), &head.content_hash).is_err() {
            queries::set_status(&connection, &head.id, "CONFLICT")?;
        }
        let id = self.runtime.id();
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO proposal_batches(id,job_id,mode,base_version_id,apply_head_id,status,summary,candidate_markdown,created_at) VALUES(?1,?2,'REWRITE',?3,?3,'ACTIVE',?4,?5,?6)", params![id,job.id,source.scope.version_id,summary,candidate_markdown,self.runtime.now_ms()?]).map_err(database_error)?;
        archive_previous(&transaction, &source.task_id, &id)?;
        self.complete_generation(&transaction, job, response, session)?;
        transaction.commit().map_err(database_error)?;
        review_queries::batch(&connection, &id)
    }
}

fn require_rewrite_job(connection: &rusqlite::Connection, job: &ReviewJob) -> Result<(), AppError> {
    let general: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM generation_jobs WHERE job_id=?1)",
            [&job.id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if general {
        return Err(AppError::invalid(
            "전체 재작성은 전용 요청에서 확인한 뒤 실행해 주세요.",
        ));
    }
    Ok(())
}
