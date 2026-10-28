use super::{context_history, errors::database_error};
use crate::domain::{
    MAX_CONTEXT_BYTES,
    error::{AppError, ErrorCode},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Map, Value};

pub(super) fn shared(
    connection: &Connection,
    document: &str,
    task: &str,
) -> Result<Map<String, Value>, AppError> {
    let row: Option<(String, String, String, String, u32)> = connection.query_row(
        "SELECT t.goal,t.pinned_rules,t.summary,d.common_rules,t.summary_event_seq FROM tasks t JOIN documents d ON t.document_id=d.id WHERE t.id=?1 AND d.id=?2",
        params![task,document], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?)),
    ).optional().map_err(database_error)?;
    let (goal, rules, summary, common, sequence) =
        row.ok_or_else(|| AppError::invalid("이 문서의 작업을 선택해 주세요."))?;
    let mut value = Map::new();
    value.insert("goal".into(), goal.into());
    value.insert("pinnedRules".into(), rules.into());
    value.insert("summary".into(), summary.into());
    value.insert("commonRules".into(), common.into());
    value.insert("historyAfterSequence".into(), sequence.into());
    value.insert(
        "messages".into(),
        context_history::messages(connection, task)?.into(),
    );
    value.insert(
        "decisions".into(),
        context_history::decisions(connection, document, task, sequence)?.into(),
    );
    bounded(&Value::Object(value.clone()))?;
    Ok(value)
}

pub(super) fn bounded(value: &Value) -> Result<String, AppError> {
    let json = serde_json::to_string(value)
        .map_err(|_| AppError::invalid("요청 맥락을 만들 수 없습니다."))?;
    if json.len() > MAX_CONTEXT_BYTES {
        return Err(too_large());
    }
    Ok(json)
}

pub(super) fn push(
    values: &mut Vec<Value>,
    value: Value,
    bytes: &mut usize,
) -> Result<(), AppError> {
    let json = bounded(&value)?;
    *bytes = bytes.checked_add(json.len()).ok_or_else(too_large)?;
    if *bytes > MAX_CONTEXT_BYTES {
        return Err(too_large());
    }
    values.push(value);
    Ok(())
}

fn too_large() -> AppError {
    AppError::new(
        ErrorCode::ContextTooLarge,
        "요청 맥락이 200 KiB를 초과했습니다. 문서 범위를 줄이거나 새 작업으로 대화를 나누어 주세요. 입력을 자동으로 잘라내지 않았습니다.",
    )
}
