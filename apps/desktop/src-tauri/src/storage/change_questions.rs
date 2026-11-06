use super::{Store, files, queries, review_queries, task_context};
use crate::{
    document::review::stale,
    domain::{
        change_question::{ChangeQuestion, QuestionChange, QuestionRequest, QuestionSubject},
        error::AppError,
        review::{Proposal, ReviewBatch},
    },
};
use rusqlite::Connection;

impl Store {
    pub fn prepare_change_question(
        &self,
        request: &QuestionRequest,
    ) -> Result<ChangeQuestion, AppError> {
        request.validate()?;
        self.ensure_current(&request.document_id)?;
        prepare(&*self.connection()?, request)
    }
}
pub(super) fn prepare(
    db: &Connection,
    request: &QuestionRequest,
) -> Result<ChangeQuestion, AppError> {
    request.validate()?;
    let head = queries::snapshot(db, &request.document_id)?;
    let batch = review_queries::batch(db, &request.batch_id)?;
    if head.version_id != request.expected_head_id
        || batch.document_id != request.document_id
        || batch.task_id != request.task_id
    {
        return Err(stale());
    }
    let (label, changes) = target_changes(db, &batch, &request.subject)?;
    let json = serde_json::to_string(&changes).map_err(|_| stale())?;
    let result = ChangeQuestion {
        document_id: batch.document_id,
        task_id: batch.task_id,
        batch_id: batch.id,
        base_version_id: batch.base_version_id,
        subject: request.subject.clone(),
        label,
        changes,
        content_hash: files::content_hash(&json),
    };
    task_context::bounded(&serde_json::to_value(&result).map_err(|_| stale())?)?;
    Ok(result)
}
fn target_changes(
    db: &Connection,
    batch: &ReviewBatch,
    subject: &QuestionSubject,
) -> Result<(String, Vec<QuestionChange>), AppError> {
    match subject {
        QuestionSubject::Proposal { id, revision } => {
            if batch.is_unit_review() {
                return Err(stale());
            }
            let p = batch
                .proposals
                .iter()
                .find(|p| p.id == *id && p.revision == *revision)
                .ok_or_else(stale)?;
            Ok((
                p.operation
                    .heading_path
                    .last()
                    .cloned()
                    .unwrap_or_else(|| "선택한 변경".into()),
                vec![change(p)],
            ))
        }
        QuestionSubject::Unit { id, revision } => {
            let unit = batch
                .review_units
                .iter()
                .find(|u| u.id == *id && u.review_revision == *revision)
                .ok_or_else(stale)?;
            let changes = batch
                .proposals
                .iter()
                .filter(|p| p.group_id == *id)
                .map(change)
                .collect();
            Ok((format!("변경 {} · {}", unit.number, unit.title), changes))
        }
        QuestionSubject::Whole => whole_changes(db, batch),
    }
}
fn change(proposal: &Proposal) -> QuestionChange {
    QuestionChange {
        id: proposal.id.clone(),
        before: proposal.operation.before.clone(),
        after: proposal.operation.after.clone(),
    }
}
pub(super) fn verify(
    db: &Connection,
    request: &crate::domain::generation::GenerateRequest,
) -> Result<(), AppError> {
    let Some(question) = &request.question else {
        return Ok(());
    };
    let prepared = prepare(
        db,
        &QuestionRequest {
            document_id: request.document_id.clone(),
            task_id: request.task_id.clone(),
            batch_id: question.batch_id.clone(),
            expected_head_id: request.expected_head_id.clone(),
            subject: question.subject.clone(),
        },
    )?;
    if prepared != *question {
        return Err(AppError::invalid(
            "질문할 변경 내용이 달라졌습니다. 대상을 다시 확인해 주세요.",
        ));
    }
    Ok(())
}
pub(super) fn saved(db: &Connection, job: &str) -> Result<Option<ChangeQuestion>, AppError> {
    use rusqlite::OptionalExtension;
    let json: Option<Option<String>> = db
        .query_row(
            "SELECT json_extract(request_json,'$.question') FROM generation_jobs WHERE job_id=?1",
            [job],
            |r| r.get(0),
        )
        .optional()
        .map_err(super::errors::database_error)?;
    json.flatten()
        .map(|value| {
            serde_json::from_str(&value)
                .map_err(|_| AppError::invalid("질문 대상 기록을 읽을 수 없습니다."))
        })
        .transpose()
}

fn whole_changes(
    db: &Connection,
    batch: &ReviewBatch,
) -> Result<(String, Vec<QuestionChange>), AppError> {
    if batch.mode != "REWRITE" || batch.is_unit_review() {
        return Err(stale());
    }
    Ok((
        "전체 문서".into(),
        vec![QuestionChange {
            id: batch.id.clone(),
            before: review_queries::base(db, batch)?,
            after: batch.candidate_markdown.clone().ok_or_else(stale)?,
        }],
    ))
}
