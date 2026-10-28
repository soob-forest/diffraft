use super::{Store, errors::database_error};
use crate::domain::{
    conversation::{
        ConversationMessage, GenerationAttempt, SavedGenerationRequest, TaskConversation,
        TaskSessionState,
    },
    document::validate_id,
    error::AppError,
};
use rusqlite::{Connection, OptionalExtension, params};

const PAGE_SIZE: u32 = 20;

impl Store {
    pub fn task_conversation(
        &self,
        task: &str,
        before: Option<u32>,
    ) -> Result<TaskConversation, AppError> {
        validate_id(task)?;
        if before == Some(0) {
            return Err(AppError::invalid("대화 순서가 올바르지 않습니다."));
        }
        let connection = self.connection()?;
        let common_rules:String=connection.query_row("SELECT d.common_rules FROM documents d JOIN tasks t ON t.document_id=d.id WHERE t.id=?1",[task],|row|row.get(0)).map_err(database_error)?;
        let mut messages = messages(&connection, task, before)?;
        let earlier_before = if messages.len() > PAGE_SIZE as usize {
            messages.pop();
            messages.last().map(|message| message.sequence)
        } else {
            None
        };
        messages.reverse();
        Ok(TaskConversation {
            task_id: task.into(),
            messages,
            earlier_before,
            session: session(&connection, task)?,
            last_attempt: last_attempt(&connection, task)?,
            common_rules,
        })
    }
}

fn messages(
    connection: &Connection,
    task: &str,
    before: Option<u32>,
) -> Result<Vec<ConversationMessage>, AppError> {
    let mut statement=connection.prepare("SELECT id,seq,role,content,created_at,job_id FROM messages WHERE task_id=?1 AND (?2 IS NULL OR seq<?2) ORDER BY seq DESC LIMIT ?3").map_err(database_error)?;
    statement
        .query_map(params![task, before, PAGE_SIZE + 1], |row| {
            Ok(ConversationMessage {
                id: row.get(0)?,
                sequence: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                job_id: row.get(5)?,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

fn session(connection: &Connection, task: &str) -> Result<TaskSessionState, AppError> {
    let status:Option<String>=connection.query_row("SELECT status FROM session_bindings WHERE task_id=?1 ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,created_at DESC,rowid DESC LIMIT 1",[task],|row|row.get(0)).optional().map_err(database_error)?;
    Ok(match status.as_deref() {
        Some("ACTIVE") => TaskSessionState::Connected,
        Some("MISSING") => TaskSessionState::Missing,
        _ => TaskSessionState::Local,
    })
}

fn last_attempt(
    connection: &Connection,
    task: &str,
) -> Result<Option<GenerationAttempt>, AppError> {
    let row:Option<AttemptRow>=connection.query_row("SELECT j.id,j.attempt_id,j.status,j.error_code,CASE WHEN g.job_id IS NOT NULL THEN 'generate' WHEN r.job_id IS NOT NULL THEN 'regenerate' ELSE 'rewrite' END,COALESCE(g.request_json,r.request_json,w.request_json) FROM jobs j LEFT JOIN generation_jobs g ON g.job_id=j.id LEFT JOIN revision_jobs r ON r.job_id=j.id LEFT JOIN rewrite_jobs w ON w.job_id=j.id WHERE j.task_id=?1 AND COALESCE(g.request_json,r.request_json,w.request_json) IS NOT NULL ORDER BY j.created_at DESC,j.rowid DESC LIMIT 1",[task],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?))).optional().map_err(database_error)?;
    row.map(|(job_id, attempt_id, status, error_code, kind, request)| {
        let error_code = error_code
            .map(|code| {
                serde_json::from_value(serde_json::Value::String(code))
                    .map_err(|_| AppError::invalid("요청 오류 코드를 읽을 수 없습니다."))
            })
            .transpose()?;
        let value: serde_json::Value = serde_json::from_str(&request)
            .map_err(|_| AppError::invalid("요청 기록을 읽을 수 없습니다."))?;
        let request: SavedGenerationRequest =
            serde_json::from_value(serde_json::json!({"kind":kind,"value":value}))
                .map_err(|_| AppError::invalid("요청 기록의 형식이 올바르지 않습니다."))?;
        Ok(GenerationAttempt {
            job_id,
            attempt_id,
            status,
            error_code,
            request,
        })
    })
    .transpose()
}

type AttemptRow = (String, String, String, Option<String>, String, String);
