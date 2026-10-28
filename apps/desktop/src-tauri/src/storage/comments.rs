use super::{Store, errors::database_error, review_queries};
use crate::{
    document::annotations::anchor,
    domain::{
        annotations::{AddComment, CommentAnchor, ReviewComment},
        document::validate_id,
        error::AppError,
    },
};
use rusqlite::{Connection, OptionalExtension, params};

const MAX_COMMENT_BYTES: usize = 16 * 1024;

impl Store {
    pub fn add_comment(&self, request: AddComment) -> Result<ReviewComment, AppError> {
        validate_comment(&request)?;
        let connection = self.connection()?;
        let batch = review_queries::batch(&connection, &request.batch_id)?;
        let proposal = review_queries::proposal_at(
            &connection,
            &request.batch_id,
            &request.proposal_id,
            request.expected_revision,
        )?;
        let anchor = anchor(&batch, &proposal, &request)?;
        if let Some(existing) = comment(&connection, &request.id)? {
            if !same_comment(&existing, &request, &anchor, &batch.task_id) {
                return Err(AppError::invalid(
                    "이미 사용한 코멘트 ID로 내용을 바꿀 수 없습니다.",
                ));
            }
            return Ok(existing);
        }
        let payload = serde_json::to_string(&anchor)
            .map_err(|_| AppError::invalid("코멘트 위치를 저장할 수 없습니다."))?;
        connection.execute("INSERT INTO comments(id,task_id,target_id,target_revision,anchor_json,text,status,created_at) VALUES(?1,?2,?3,?4,?5,?6,'OPEN',?7)", params![request.id,batch.task_id,proposal.id,proposal.revision,payload,request.text,self.runtime.now_ms()?]).map_err(database_error)?;
        comment(&connection, &request.id)?
            .ok_or_else(|| AppError::invalid("코멘트를 찾을 수 없습니다."))
    }

    pub fn review_comments(&self, task: &str) -> Result<Vec<ReviewComment>, AppError> {
        validate_id(task)?;
        task_comments(&*self.connection()?, task)
    }

    pub fn set_comment_status(
        &self,
        id: &str,
        revision: u32,
        resolved: bool,
    ) -> Result<ReviewComment, AppError> {
        validate_id(id)?;
        let connection = self.connection()?;
        let existing = comment(&connection, id)?
            .ok_or_else(|| AppError::invalid("코멘트를 찾을 수 없습니다."))?;
        if existing.revision != revision {
            return Err(crate::document::review::stale());
        }
        let status = if resolved {
            "RESOLVED"
        } else if existing.anchor.display_range.is_none() {
            "NEEDS_VERIFICATION"
        } else {
            "OPEN"
        };
        let next = revision
            .checked_add(1)
            .ok_or_else(|| AppError::invalid("코멘트 revision 한도를 초과했습니다."))?;
        connection
            .execute(
                "UPDATE comments SET status=?1,revision=?2 WHERE id=?3 AND revision=?4",
                params![status, next, id, revision],
            )
            .map_err(database_error)?;
        comment(&connection, id)?.ok_or_else(|| AppError::invalid("코멘트를 찾을 수 없습니다."))
    }
}

pub(super) fn task_comments(
    connection: &Connection,
    task: &str,
) -> Result<Vec<ReviewComment>, AppError> {
    let mut statement = connection
        .prepare("SELECT id FROM comments WHERE task_id=?1 ORDER BY created_at,id")
        .map_err(database_error)?;
    let ids = statement
        .query_map([task], |row| row.get::<_, String>(0))
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    ids.into_iter()
        .map(|id| {
            comment(connection, &id)?.ok_or_else(|| AppError::invalid("코멘트를 찾을 수 없습니다."))
        })
        .collect()
}

pub(super) fn comment(
    connection: &Connection,
    id: &str,
) -> Result<Option<ReviewComment>, AppError> {
    let row = connection.query_row("SELECT id,task_id,target_id,anchor_json,text,status,revision FROM comments WHERE id=?1", [id], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?,row.get::<_,u32>(6)?))).optional().map_err(database_error)?;
    row.map(
        |(id, task_id, proposal_id, anchor, text, status, revision)| {
            Ok(ReviewComment {
                id,
                task_id,
                proposal_id,
                anchor: serde_json::from_str(&anchor)
                    .map_err(|_| AppError::invalid("저장된 코멘트 위치를 읽을 수 없습니다."))?,
                text,
                status,
                revision,
            })
        },
    )
    .transpose()
}

fn validate_comment(request: &AddComment) -> Result<(), AppError> {
    for id in [&request.id, &request.batch_id, &request.proposal_id] {
        validate_id(id)?;
    }
    if request.expected_revision == 0
        || request.text.trim().is_empty()
        || request.text.len() > MAX_COMMENT_BYTES
        || request.text.contains('\0')
    {
        return Err(AppError::invalid(
            "코멘트는 내용이 있는 16 KiB 이내의 텍스트로 입력해 주세요.",
        ));
    }
    Ok(())
}

fn same_comment(
    existing: &ReviewComment,
    request: &AddComment,
    anchor: &CommentAnchor,
    task: &str,
) -> bool {
    existing.task_id == task
        && existing.proposal_id == request.proposal_id
        && existing.text == request.text
        && existing.anchor.proposal_revision == request.expected_revision
        && existing.anchor.side == request.side
        && existing.anchor.range == anchor.range
        && existing.anchor.quote == anchor.quote
}
