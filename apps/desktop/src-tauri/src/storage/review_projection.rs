use super::{Store, errors::lock_error, files, queries, review_queries};
use crate::{
    document::{
        diff::compare,
        review::{groups, reconstruct, stale, valid_head},
    },
    domain::{
        document::{DocumentSnapshot, DocumentStatus, validate_id},
        error::AppError,
        review::{Decision, Validity},
        review_view::ReviewProjection,
    },
};
use std::path::Path;

impl Store {
    pub fn review_projection(
        &self,
        batch_id: &str,
        expected_head: &str,
    ) -> Result<ReviewProjection, AppError> {
        validate_id(batch_id)?;
        validate_id(expected_head)?;
        let document_id = review_queries::batch(&*self.connection()?, batch_id)?.document_id;
        let lock = self.document_lock(&document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let (mut batch, head, base) = {
            let connection = self.connection()?;
            let head = projection_head(&connection, &document_id, expected_head)?;
            let batch = review_queries::batch(&connection, batch_id)?;
            let base = review_queries::base(&connection, &batch)?;
            (batch, head, base)
        };
        let valid = valid_head(&base, &batch, &head).is_ok();
        if !valid {
            for proposal in &mut batch.proposals {
                if proposal.decision == Decision::Pending {
                    proposal.validity = Validity::Stale;
                }
            }
        }
        let groups = if valid { groups(&batch)? } else { Vec::new() };
        let after = if batch.mode == "REWRITE" {
            batch
                .candidate_markdown
                .clone()
                .ok_or_else(|| AppError::invalid("재작성 후보 본문이 없습니다."))?
        } else if valid {
            reconstruct(&base, &batch, true)?
        } else {
            head.content.clone()
        };
        let (hunks, stats) = compare(&head.content, &after, &groups);
        Ok(ReviewProjection {
            id: self.runtime.id(),
            batch,
            current_head_id: head.version_id,
            before: head.content,
            after,
            groups,
            hunks,
            stats,
        })
    }
}

fn projection_head(
    connection: &rusqlite::Connection,
    document: &str,
    expected: &str,
) -> Result<DocumentSnapshot, AppError> {
    let head = queries::snapshot(connection, document)?;
    if head.version_id != expected {
        return Err(stale());
    }
    if head.status == DocumentStatus::Ready
        && files::verify_hash(Path::new(&head.path), &head.content_hash).is_err()
    {
        queries::set_status(connection, document, "CONFLICT")?;
        return queries::snapshot(connection, document);
    }
    Ok(head)
}
