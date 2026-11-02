use super::{Store, errors::database_error};
use crate::domain::{
    document::validate_id,
    error::AppError,
    model::ModelSelection,
    provider::{ProviderModel, decode_request_model},
    review::ReviewJob,
};
use rusqlite::Connection;

impl Store {
    pub fn job_model(&self, job: &ReviewJob) -> Result<ModelSelection, AppError> {
        validate_id(&job.id)?;
        requested_model(&*self.connection()?, &job.id)
    }

    pub fn job_provider_model(&self, job: &ReviewJob) -> Result<ProviderModel, AppError> {
        validate_id(&job.id)?;
        provider_model(&*self.connection()?, &job.id)
    }
}

pub(super) fn requested_model(
    connection: &Connection,
    job: &str,
) -> Result<ModelSelection, AppError> {
    provider_model(connection, job)?.claude()
}

pub(super) fn provider_model(
    connection: &Connection,
    job: &str,
) -> Result<ProviderModel, AppError> {
    let json: String = connection.query_row(
        "SELECT request_json FROM generation_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM revision_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM rewrite_jobs WHERE job_id=?1 UNION ALL SELECT request_json FROM selection_jobs WHERE job_id=?1",
        [job], |row| row.get(0),
    ).map_err(database_error)?;
    let value: serde_json::Value = serde_json::from_str(&json)
        .map_err(|_| AppError::invalid("요청 모델 기록을 읽을 수 없습니다."))?;
    match value.get("model") {
        None => Ok(ProviderModel::default()),
        Some(model) => decode_request_model(model.clone())
            .map_err(|_| AppError::invalid("요청 모델 기록이 올바르지 않습니다.")),
    }
}
