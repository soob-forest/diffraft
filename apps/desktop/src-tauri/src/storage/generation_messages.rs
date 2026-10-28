use super::{Store, errors::database_error};
use crate::domain::{error::AppError, review::ReviewJob};
use rusqlite::{Connection, params};

impl Store {
    pub(super) fn insert_generation_message(
        &self,
        connection: &Connection,
        job: &ReviewJob,
        role: &str,
        content: &str,
    ) -> Result<(), AppError> {
        let task: String = connection
            .query_row(
                "SELECT task_id FROM jobs WHERE id=?1 AND attempt_id=?2",
                params![job.id, job.attempt_id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        let next: u32 = connection
            .query_row(
                "SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE task_id=?1",
                [&task],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        connection.execute("INSERT INTO messages(id,task_id,seq,role,content,created_at,job_id) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![self.runtime.id(),task,next,role,content,self.runtime.now_ms()?,job.id]).map_err(database_error)?;
        Ok(())
    }
}

pub(super) fn instruction(connection: &Connection, job: &ReviewJob) -> Result<String, AppError> {
    let json: String = connection.query_row("SELECT request_json FROM generation_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM revision_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM rewrite_jobs WHERE job_id=?1", [&job.id], |row| row.get(0)).map_err(database_error)?;
    let value: serde_json::Value = serde_json::from_str(&json)
        .map_err(|_| AppError::invalid("저장한 요청을 읽을 수 없습니다."))?;
    value["instruction"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::invalid("저장한 요청에 지시가 없습니다."))
}
