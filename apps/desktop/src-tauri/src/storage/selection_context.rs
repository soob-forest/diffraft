use super::{
    comments::task_comments, errors::database_error, selection_source::SelectionSource,
    task_context,
};
use crate::domain::{error::AppError, selection_request::SelectionRequest};
use rusqlite::Connection;
use serde_json::json;

pub(super) fn build(
    db: &Connection,
    request: &SelectionRequest,
    source: &SelectionSource,
) -> Result<String, AppError> {
    let selection = request.selection();
    let comments = task_comments(db, &request.task_id)?;
    if request
        .comment_ids
        .iter()
        .any(|id| !comments.iter().any(|comment| &comment.id == id))
    {
        return Err(AppError::invalid(
            "다른 작업의 코멘트는 전달할 수 없습니다.",
        ));
    }
    let comments: Vec<_> = comments
        .into_iter()
        .filter(|comment| request.comment_ids.contains(&comment.id))
        .collect();
    let blocks: Vec<_> = source
        .scope
        .blocks
        .iter()
        .map(|block| json!({"block_id":block.id,"before":block.text}))
        .collect();
    let mut value = json!({"schemaVersion":1,"mode":"PATCH","taskId":request.task_id,"model":request.model,"instruction":request.instruction,
        "editableSource":"confirmed_selection","confirmed":{"versionId":source.head.version_id,"version":source.head.version,"contentHash":source.head.content_hash},
        "scope":{"from":source.scope.from,"to":source.scope.to,"text":source.scope.text,"blocks":blocks},"selection":selection,
        "target":{"operation":{"blockId":source.scope.blocks.first().map(|b|b.id.as_str()),"before":source.scope.text,"after":source.scope.text}},"comments":comments,
        "effects":{"preserveExisting":true,"wholeApply":false,"activeBatchIds":active_batches(db,&request.task_id)?},
        "constraint":"Return PATCH changes only within scope.blocks with exact before and block_id. These changes form a new unapproved batch against the current confirmed head. Existing pending batches are retained. Never write files."});
    if let Some((batch, candidate)) = &source.rewrite {
        value["editableSource"] = "rewrite_candidate".into();
        value["scope"] = json!({"text":selection.quote,"blocks":[{"block_id":"candidate","before":selection.quote}]});
        value["target"] = json!({"batchId":batch.id,"operation":{"blockId":"candidate","before":source.head.content,"after":candidate}});
        value["effects"]["wholeApply"] = true.into();
        value["constraint"]="Return exactly one PATCH change for block_id=candidate, before=selection.quote, after=only the replacement text. The editable source is an unapproved whole rewrite candidate. Rust preserves its prefix and suffix. The resulting candidate still requires whole-document apply. Never write files.".into();
    }
    value
        .as_object_mut()
        .expect("context object")
        .extend(task_context::shared(
            db,
            &request.document_id,
            &request.task_id,
        )?);
    task_context::bounded(&value)
}
fn active_batches(db: &Connection, task: &str) -> Result<Vec<String>, AppError> {
    let mut statement=db.prepare("SELECT b.id FROM proposal_batches b JOIN jobs j ON j.id=b.job_id WHERE j.task_id=?1 AND b.status='ACTIVE' ORDER BY b.created_at,b.id").map_err(database_error)?;
    statement
        .query_map([task], |row| row.get(0))
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}
