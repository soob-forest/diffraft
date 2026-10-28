use super::{comments::task_comments, errors::database_error};
use crate::{
    document::annotations::reanchor,
    domain::{
        error::AppError,
        review::{Proposal, ReviewBatch},
    },
};
use rusqlite::{Connection, params};

pub fn update(
    connection: &Connection,
    batch: &ReviewBatch,
    proposal: &Proposal,
) -> Result<(), AppError> {
    for comment in task_comments(connection, &batch.task_id)?
        .into_iter()
        .filter(|c| c.proposal_id == proposal.id)
    {
        let anchor = reanchor(
            &comment.anchor,
            &proposal.operation.after,
            proposal.revision,
        );
        let status = if comment.status == "RESOLVED" {
            "RESOLVED"
        } else if anchor.display_range.is_none() {
            "NEEDS_VERIFICATION"
        } else {
            "OPEN"
        };
        let revision = comment
            .revision
            .checked_add(1)
            .ok_or_else(|| AppError::invalid("코멘트 revision 한도를 초과했습니다."))?;
        let json = serde_json::to_string(&anchor)
            .map_err(|_| AppError::invalid("코멘트 위치를 저장할 수 없습니다."))?;
        connection
            .execute(
                "UPDATE comments SET anchor_json=?1,status=?2,revision=?3 WHERE id=?4",
                params![json, status, revision, comment.id],
            )
            .map_err(database_error)?;
    }
    Ok(())
}
