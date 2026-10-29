use super::{Store, errors::database_error};
use crate::domain::{
    document::validate_id, error::AppError, model::ModelSelection, review::ReviewJob,
};
use rusqlite::Connection;

impl Store {
    pub fn job_model(&self, job: &ReviewJob) -> Result<ModelSelection, AppError> {
        validate_id(&job.id)?;
        requested_model(&*self.connection()?, &job.id)
    }
}

pub(super) fn requested_model(
    connection: &Connection,
    job: &str,
) -> Result<ModelSelection, AppError> {
    let json: String = connection.query_row(
        "SELECT request_json FROM generation_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM revision_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM rewrite_jobs WHERE job_id=?1",
        [job], |row| row.get(0),
    ).map_err(database_error)?;
    let value: serde_json::Value = serde_json::from_str(&json)
        .map_err(|_| AppError::invalid("요청 모델 기록을 읽을 수 없습니다."))?;
    match value.get("model") {
        None => Ok(ModelSelection::default()),
        Some(model) => serde_json::from_value(model.clone())
            .map_err(|_| AppError::invalid("요청 모델 기록이 올바르지 않습니다.")),
    }
}
