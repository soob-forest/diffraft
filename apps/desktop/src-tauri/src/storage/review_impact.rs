use super::{Store, errors::database_error};
use crate::domain::{document::validate_id, error::AppError, review_api::ReviewImpact};
use rusqlite::OptionalExtension;

impl Store {
    pub fn review_impact(&self, document: &str) -> Result<ReviewImpact, AppError> {
        validate_id(document)?;
        let connection = self.connection()?;
        let (proposals, groups) = connection.query_row(
            "SELECT COALESCE(SUM(n),0),COUNT(*) FROM (
                SELECT COUNT(*) n FROM proposals p JOIN proposal_batches b ON b.id=p.batch_id
                JOIN jobs j ON j.id=b.job_id JOIN tasks t ON t.id=j.task_id
                JOIN documents d ON d.id=t.document_id
                WHERE t.document_id=?1 AND b.status='ACTIVE' AND b.review_mode='CHANGES'
                AND b.apply_head_id=d.head_version_id AND p.decision='PENDING' AND p.validity='VALID'
                GROUP BY b.id,p.group_id)", [document], |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(database_error)?;
        let rewrites = connection.query_row(
            "SELECT COUNT(*) FROM proposal_batches b JOIN jobs j ON j.id=b.job_id
             JOIN tasks t ON t.id=j.task_id JOIN documents d ON d.id=t.document_id
             WHERE t.document_id=?1 AND b.status='ACTIVE' AND b.mode='REWRITE' AND b.review_mode='WHOLE' AND b.apply_head_id=d.head_version_id",
            [document], |row| row.get(0),
        ).map_err(database_error)?;
        let first_task_id = connection.query_row(
            "SELECT j.task_id FROM proposal_batches b JOIN jobs j ON j.id=b.job_id JOIN tasks t ON t.id=j.task_id JOIN documents d ON d.id=t.document_id WHERE t.document_id=?1 AND b.status='ACTIVE' AND b.apply_head_id=d.head_version_id AND (b.review_mode='WHOLE' OR EXISTS(SELECT 1 FROM proposals p WHERE p.batch_id=b.id AND p.decision='PENDING' AND p.validity='VALID')) ORDER BY b.created_at DESC,b.rowid DESC LIMIT 1",[document],|row|row.get(0)).optional().map_err(database_error)?;
        Ok(ReviewImpact {
            first_task_id,
            proposals,
            groups,
            rewrites,
        })
    }
}
