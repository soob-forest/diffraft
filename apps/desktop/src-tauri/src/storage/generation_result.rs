use super::{Store, errors::database_error, job_lifecycle::require_running, review_queries};
use crate::domain::{
    ai::{AiResponse, ResponseMode},
    error::AppError,
    generation::{GenerateRequest, GenerationOutcome},
    review::ReviewJob,
};
use rusqlite::{OptionalExtension, params};

impl Store {
    pub fn complete_explanation(
        &self,
        job: &ReviewJob,
        response: &AiResponse,
        session: &str,
    ) -> Result<GenerationOutcome, AppError> {
        let AiResponse::Explain { answer, .. } = response else {
            return Err(AppError::invalid(
                "설명 요청에는 대화 답변만 저장할 수 있습니다.",
            ));
        };
        let mut connection = self.connection()?;
        require_running(&connection, job)?;
        let json: String = connection
            .query_row(
                "SELECT request_json FROM generation_jobs WHERE job_id=?1",
                [&job.id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        let request: GenerateRequest = serde_json::from_str(&json)
            .map_err(|_| AppError::invalid("설명 요청 기록을 읽을 수 없습니다."))?;
        if request.mode != ResponseMode::Explain {
            return Err(AppError::invalid("설명 요청이 아닙니다."));
        }
        let transaction = connection.transaction().map_err(database_error)?;
        self.complete_generation(&transaction, job, response, Some(session))?;
        transaction.commit().map_err(database_error)?;
        Ok(GenerationOutcome::Explain(answer.clone()))
    }

    pub fn completed_generation(
        &self,
        job: &ReviewJob,
    ) -> Result<Option<GenerationOutcome>, AppError> {
        let connection = self.connection()?;
        let status:Option<String> = connection.query_row("SELECT j.status FROM jobs j JOIN generation_jobs g ON g.job_id=j.id WHERE j.id=?1 AND j.attempt_id=?2",params![job.id,job.attempt_id],|row|row.get(0)).optional().map_err(database_error)?;
        if status.as_deref() != Some("SUCCEEDED") {
            return Ok(None);
        }
        let batch: Option<String> = connection
            .query_row(
                "SELECT id FROM proposal_batches WHERE job_id=?1",
                [&job.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if let Some(id) = batch {
            return Ok(Some(GenerationOutcome::Patch(Box::new(
                review_queries::batch(&connection, &id)?,
            ))));
        }
        let answer: String = connection
            .query_row(
                "SELECT content FROM messages WHERE job_id=?1 AND role='ASSISTANT'",
                [&job.id],
                |row| row.get(0),
            )
            .map_err(database_error)?;
        Ok(Some(GenerationOutcome::Explain(answer)))
    }
}
