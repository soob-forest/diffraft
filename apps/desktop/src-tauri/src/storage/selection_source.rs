use super::{errors::database_error, files, queries, review_queries, rewrite_validation};
use crate::{
    document::{
        review::{groups, stale, valid_head},
        scope::select,
        selection::selection_range,
    },
    domain::{
        document::DocumentSnapshot,
        editor::{ScopeSelection, ScopeSnapshot},
        error::AppError,
        review::{ReviewBatch, Validity},
        selection_request::{SelectionJobTarget, SelectionRequest},
    },
};
use rusqlite::Connection;

pub(super) struct SelectionSource {
    pub head: DocumentSnapshot,
    pub scope: ScopeSnapshot,
    pub rewrite: Option<(ReviewBatch, String)>,
}
pub(super) fn source(
    db: &Connection,
    request: &SelectionRequest,
) -> Result<SelectionSource, AppError> {
    let head = queries::snapshot(db, &request.document_id)?;
    if head.version_id != request.expected_head_id {
        return Err(stale());
    }
    rewrite_validation::writable(db, &head)?;
    let (scope, rewrite) = match &request.target {
        SelectionJobTarget::Confirmed(selection) => {
            selection_range(&head.content, selection)?;
            let scope = select(
                &head,
                ScopeSelection::Selection {
                    from: selection.from_utf16,
                    to: selection.to_utf16,
                },
            )?;
            reject_pending_overlap(db, &head, &scope)?;
            (scope, None)
        }
        SelectionJobTarget::Rewrite {
            batch_id,
            candidate_hash,
            selection,
        } => {
            let batch = review_queries::batch(db, batch_id)?;
            batch.require_editable_candidate()?;
            if batch.document_id != head.id
                || batch.task_id != request.task_id
                || batch.mode != "REWRITE"
                || batch.status != "ACTIVE"
                || batch.base_version_id != head.version_id
                || batch.apply_head_id != head.version_id
            {
                return Err(stale());
            }
            let candidate = batch.candidate_markdown.clone().ok_or_else(stale)?;
            if files::content_hash(&candidate) != *candidate_hash {
                return Err(stale());
            }
            selection_range(&candidate, selection)?;
            (
                select(&head, ScopeSelection::Whole)?,
                Some((batch, candidate)),
            )
        }
    };
    Ok(SelectionSource {
        head,
        scope,
        rewrite,
    })
}
fn reject_pending_overlap(
    db: &Connection,
    head: &DocumentSnapshot,
    scope: &ScopeSnapshot,
) -> Result<(), AppError> {
    let mut statement=db.prepare("SELECT b.id FROM proposal_batches b JOIN jobs j ON j.id=b.job_id JOIN tasks t ON t.id=j.task_id WHERE t.document_id=?1 AND b.status='ACTIVE' AND b.review_mode='CHANGES' AND b.apply_head_id=?2").map_err(database_error)?;
    let ids = statement
        .query_map([&head.id, &head.version_id], |row| row.get::<_, String>(0))
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    for id in ids {
        let batch = review_queries::batch(db, &id)?;
        let base = review_queries::base(db, &batch)?;
        if valid_head(&base, &batch, head).is_err() {
            continue;
        }
        for group in groups(&batch)? {
            if group.validity != Validity::Valid {
                continue;
            }
            if group.before_ranges.iter().any(|range| {
                if range.from == range.to {
                    range.from >= scope.from && range.from <= scope.to
                } else {
                    range.from < scope.to && scope.from < range.to
                }
            }) {
                return Err(AppError::invalid(
                    "미승인 제안과 겹칩니다. 해당 제안 내용에서 수정할 부분을 선택해 주세요.",
                ));
            }
        }
    }
    Ok(())
}
