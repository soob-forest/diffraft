use super::{
    Store,
    errors::{database_error, lock_error},
    files, queries, review_queries,
};
use crate::{
    document::patch::{requires_dependency_group, validate_patch},
    domain::{
        ai::AiResponse,
        document::{DocumentStatus, validate_id},
        editor::ScopeSnapshot,
        error::{AppError, ErrorCode},
        review::{EditOperation, ReviewBatch, ReviewJob},
    },
};
use rusqlite::{Connection, params};
use std::path::Path;

pub(super) struct JobSource {
    pub document_id: String,
    pub task_id: String,
    pub base: String,
    pub scope: ScopeSnapshot,
}

impl Store {
    pub fn register_patch(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
    ) -> Result<ReviewBatch, AppError> {
        self.register_patch_result(job, response, None)
    }

    pub fn complete_patch(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: &str,
    ) -> Result<ReviewBatch, AppError> {
        self.register_patch_result(job, response, Some(session))
    }

    fn register_patch_result(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: Option<&str>,
    ) -> Result<ReviewBatch, AppError> {
        validate_id(&job.id)?;
        validate_id(&job.attempt_id)?;
        require_patch_job(&*self.connection()?, job)?;
        let source = job_source(&*self.connection()?, job)?;
        let operations = validate_patch(&source.base, &source.scope, response)?;
        let AiResponse::Patch { summary, .. } = response else {
            unreachable!()
        };
        let lock = self.document_lock(&source.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        job_source(&connection, job)?;
        let head = queries::snapshot(&connection, &source.document_id)?;
        let disk_matches = files::verify_hash(Path::new(&head.path), &head.content_hash).is_ok();
        if !disk_matches {
            queries::set_status(&connection, &head.id, "CONFLICT")?;
        }
        let validity = if head.version_id == source.scope.version_id
            && head.status == DocumentStatus::Ready
            && disk_matches
        {
            "VALID"
        } else {
            "STALE"
        };
        let id = self.runtime.id();
        let now = self.runtime.now_ms()?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction.execute("INSERT INTO proposal_batches(id,job_id,mode,base_version_id,apply_head_id,status,summary,created_at) VALUES(?1,?2,'PATCH',?3,?3,'ACTIVE',?4,?5)", params![id,job.id,source.scope.version_id,summary,now]).map_err(database_error)?;
        archive_previous(&transaction, &source.task_id, &id)?;
        self.insert_proposals(&transaction, &id, &operations, validity)?;
        self.complete_generation(&transaction, job, response, session)?;
        transaction.commit().map_err(database_error)?;
        review_queries::batch(&connection, &id)
    }

    fn insert_proposals(
        &self,
        connection: &Connection,
        batch: &str,
        operations: &[EditOperation],
        validity: &str,
    ) -> Result<(), AppError> {
        let combined = requires_dependency_group(operations).then(|| self.runtime.id());
        for operation in operations {
            let id = self.runtime.id();
            let group = combined.clone().unwrap_or_else(|| self.runtime.id());
            let anchor = serde_json::to_string(operation)
                .map_err(|_| AppError::invalid("제안 범위를 저장할 수 없습니다."))?;
            connection.execute("INSERT INTO proposals(id,batch_id,revision,group_id,block_anchor,before_text,after_text,reason,decision,validity,created_at) VALUES(?1,?2,1,?3,?4,?5,?6,?7,'PENDING',?8,?9)", params![id,batch,group,anchor,operation.before,operation.after,operation.reason,validity,self.runtime.now_ms()?]).map_err(database_error)?;
        }
        Ok(())
    }
}

fn require_patch_job(connection: &Connection, job: &ReviewJob) -> Result<(), AppError> {
    let rewrite: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM rewrite_jobs WHERE job_id=?1 UNION ALL SELECT 1 FROM generation_jobs WHERE job_id=?1 AND json_extract(request_json,'$.mode')!='PATCH')",
            [&job.id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if rewrite {
        return Err(AppError::invalid(
            "부분 수정 요청에만 PATCH 후보를 등록할 수 있습니다.",
        ));
    }
    Ok(())
}

pub(super) fn job_source(connection: &Connection, job: &ReviewJob) -> Result<JobSource, AppError> {
    let regeneration: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM revision_jobs WHERE job_id=?1)",
            [&job.id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if regeneration {
        return Err(AppError::invalid(
            "재제안 결과는 기존 후보 revision으로 등록해야 합니다.",
        ));
    }
    let row: (String,String,String,String,String) = connection.query_row("SELECT t.document_id,j.task_id,v.content_utf8,j.scope_json,j.status FROM jobs j JOIN tasks t ON j.task_id=t.id JOIN versions v ON j.base_version_id=v.id WHERE j.id=?1 AND j.attempt_id=?2", params![job.id,job.attempt_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))).map_err(database_error)?;
    if row.4 != "RUNNING" {
        return Err(AppError::new(
            ErrorCode::Cancelled,
            "활성 요청이 아니므로 결과를 등록하지 않았습니다.",
        ));
    }
    Ok(JobSource {
        document_id: row.0,
        task_id: row.1,
        base: row.2,
        scope: serde_json::from_str(&row.3)
            .map_err(|_| AppError::invalid("요청 범위를 읽을 수 없습니다."))?,
    })
}

pub(super) fn archive_previous(
    connection: &Connection,
    task: &str,
    current: &str,
) -> Result<(), AppError> {
    connection.execute("UPDATE proposal_batches SET status='ARCHIVED' WHERE id!=?1 AND status='ACTIVE' AND job_id IN (SELECT id FROM jobs WHERE task_id=?2)", params![current,task]).map_err(database_error)?;
    Ok(())
}
