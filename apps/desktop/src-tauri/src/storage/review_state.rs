use super::{Store, comments::task_comments, errors::database_error, queries, review_queries};
use crate::domain::{
    document::validate_id,
    error::AppError,
    review::Proposal,
    review_api::{BatchSummary, TaskReview},
};

impl Store {
    pub fn task_review(&self, task: &str) -> Result<TaskReview, AppError> {
        validate_id(task)?;
        let connection = self.connection()?;
        let mut statement = connection.prepare("SELECT b.id,b.base_version_id,b.mode,b.status,b.summary FROM proposal_batches b JOIN jobs j ON b.job_id=j.id WHERE j.task_id=?1 ORDER BY b.created_at DESC,b.rowid DESC").map_err(database_error)?;
        let batches = statement
            .query_map([task], |row| {
                Ok(BatchSummary {
                    id: row.get(0)?,
                    base_version_id: row.get(1)?,
                    mode: row.get(2)?,
                    status: row.get(3)?,
                    summary: row.get(4)?,
                })
            })
            .map_err(database_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(database_error)?;
        Ok(TaskReview {
            batches,
            comments: task_comments(&connection, task)?,
            generating: review_queries::active_job(&connection)?,
            sequence: queries::next_sequence(&connection)? - 1,
        })
    }

    pub fn proposal_revision(
        &self,
        batch: &str,
        id: &str,
        revision: u32,
    ) -> Result<Proposal, AppError> {
        validate_id(batch)?;
        validate_id(id)?;
        review_queries::proposal_at(&*self.connection()?, batch, id, revision)
    }
}
