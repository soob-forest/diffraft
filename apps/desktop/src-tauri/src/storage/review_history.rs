use super::{Store, review_queries};
use crate::{
    document::diff::compare,
    domain::{document::validate_id, error::AppError, review_api::ProposalComparison},
};

impl Store {
    pub fn save_selection_revision(
        &self,
        mut request: crate::domain::annotations::RevisionRequest,
        selection: crate::domain::regeneration::CandidateSelection,
    ) -> Result<crate::domain::review::ReviewBatch, AppError> {
        let batch = self.review_batch(&request.batch_id)?;
        if batch.task_id != selection.task_id {
            return Err(AppError::invalid("선택 대상의 작업이 일치하지 않습니다."));
        }
        let proposal = self.proposal_revision(
            &request.batch_id,
            &request.proposal_id,
            request.expected_revision,
        )?;
        request.after = crate::document::selection::replace_selection(
            &proposal.operation.after,
            &selection,
            &request.after,
        )?;
        self.save_proposal_revision(request)
    }
    pub fn historical_proposal(
        &self,
        batch: &str,
        id: &str,
        revision: u32,
        previous: Option<u32>,
    ) -> Result<ProposalComparison, AppError> {
        validate_id(batch)?;
        validate_id(id)?;
        if revision == 0 || previous.is_some_and(|value| value == 0 || value >= revision) {
            return Err(AppError::invalid("비교할 후보 revision을 확인해 주세요."));
        }
        let connection = self.connection()?;
        let batch = review_queries::batch(&connection, batch)?;
        let proposal = review_queries::proposal_at(&connection, &batch.id, id, revision)?;
        let before = match previous {
            Some(value) => {
                review_queries::proposal_at(&connection, &batch.id, id, value)?
                    .operation
                    .after
            }
            None => proposal.operation.before.clone(),
        };
        let after = proposal.operation.after.clone();
        let (hunks, stats) = compare(&before, &after, &[]);
        Ok(ProposalComparison {
            base_version_id: batch.base_version_id,
            proposal,
            before,
            after,
            hunks,
            stats,
        })
    }
}
