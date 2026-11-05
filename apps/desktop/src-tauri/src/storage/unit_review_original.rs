use super::{Store, queries, review_queries};
use crate::{
    document::{
        diff::compare,
        review::{groups, stale},
    },
    domain::{
        document::validate_id,
        error::AppError,
        review::{Decision, Validity},
        review_view::ReviewProjection,
    },
};

impl Store {
    pub fn original_rewrite_projection(
        &self,
        batch_id: &str,
    ) -> Result<ReviewProjection, AppError> {
        validate_id(batch_id)?;
        let db = self.connection()?;
        let batch = review_queries::batch(&db, batch_id)?;
        if batch.mode != "REWRITE" {
            return Err(stale());
        }
        let before = review_queries::base(&db, &batch)?;
        let after = batch.candidate_markdown.clone().ok_or_else(stale)?;
        let head = queries::snapshot(&db, &batch.document_id)?;
        let mut all = batch.clone();
        for proposal in &mut all.proposals {
            proposal.decision = Decision::Pending;
            proposal.validity = Validity::Valid;
        }
        let groups = groups(&all)?;
        let (hunks, stats) = compare(&before, &after, &groups);
        Ok(ReviewProjection {
            id: self.runtime.id(),
            batch,
            current_head_id: head.version_id,
            before,
            after,
            groups,
            hunks,
            stats,
        })
    }
}
