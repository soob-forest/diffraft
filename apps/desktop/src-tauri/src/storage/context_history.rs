use super::{errors::database_error, review_queries, task_context::push};
use crate::domain::{error::AppError, review::DecisionRequest};
use rusqlite::{Connection, params};
use serde_json::{Value, json};

pub(super) fn messages(connection: &Connection, task: &str) -> Result<Vec<Value>, AppError> {
    let mut statement = connection
        .prepare("SELECT seq,role,content FROM messages WHERE task_id=?1 ORDER BY seq")
        .map_err(database_error)?;
    let mut rows = statement.query([task]).map_err(database_error)?;
    let (mut values, mut bytes) = (Vec::new(), 0);
    while let Some(row) = rows.next().map_err(database_error)? {
        let value = json!({"sequence": row.get::<_,u32>(0).map_err(database_error)?,
            "role": row.get::<_,String>(1).map_err(database_error)?,
            "content": row.get::<_,String>(2).map_err(database_error)?});
        push(&mut values, value, &mut bytes)?;
    }
    Ok(values)
}

pub(super) fn decisions(
    connection: &Connection,
    document: &str,
    task: &str,
    after: u32,
) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare("SELECT seq,kind,payload,version_id FROM decision_events WHERE document_id=?1 AND (task_id=?2 OR task_id IS NULL) AND seq>?3 ORDER BY seq").map_err(database_error)?;
    let mut rows = statement
        .query(params![document, task, after])
        .map_err(database_error)?;
    let (mut values, mut bytes) = (Vec::new(), 0);
    while let Some(row) = rows.next().map_err(database_error)? {
        let payload: String = row.get(2).map_err(database_error)?;
        let kind: String = row.get(1).map_err(database_error)?;
        let payload: Value = serde_json::from_str(&payload)
            .map_err(|_| AppError::invalid("결정 기록을 읽을 수 없습니다."))?;
        let changes = decided_changes(connection, task, &kind, &payload)?;
        let value = json!({"sequence": row.get::<_,u32>(0).map_err(database_error)?, "kind":kind,
            "payload":payload,"changes":changes,"versionId":row.get::<_,String>(3).map_err(database_error)?});
        push(&mut values, value, &mut bytes)?;
    }
    Ok(values)
}

fn decided_changes(
    connection: &Connection,
    task: &str,
    kind: &str,
    payload: &Value,
) -> Result<Vec<Value>, AppError> {
    let request = match kind {
        "accept" => &payload["effects"]["request"],
        "reject" => payload,
        _ => return Ok(Vec::new()),
    };
    let request: DecisionRequest = serde_json::from_value(request.clone())
        .map_err(|_| AppError::invalid("승인/거절 기록을 읽을 수 없습니다."))?;
    let batch = review_queries::batch(connection, &request.batch_id)?;
    if batch.task_id != task {
        return Err(AppError::invalid("결정 기록의 작업이 일치하지 않습니다."));
    }
    let (mut changes, mut bytes) = (Vec::new(), 0);
    for reference in request.proposals {
        let proposal =
            review_queries::proposal_at(connection, &batch.id, &reference.id, reference.revision)?;
        let value = json!({"proposalId":proposal.id, "revision":proposal.revision,
            "before":proposal.operation.before,"after":proposal.operation.after,"decision":kind});
        push(&mut changes, value, &mut bytes)?;
    }
    Ok(changes)
}
