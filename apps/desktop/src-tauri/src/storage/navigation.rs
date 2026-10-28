use super::{Store, editor::read_state, errors::database_error, queries};
use crate::domain::{document::validate_id, editor::EditorState, error::AppError};
use rusqlite::{Connection, OptionalExtension, params};

impl Store {
    pub fn select_document(&self, id: &str) -> Result<EditorState, AppError> {
        validate_id(id)?;
        let connection = self.connection()?;
        let state = read_state(&connection, id)?;
        connection.execute(
            "INSERT INTO workspace_selection(singleton,document_id) VALUES(1,?1) ON CONFLICT(singleton) DO UPDATE SET document_id=excluded.document_id",
            [id],
        ).map_err(database_error)?;
        Ok(state)
    }

    pub fn select_task(
        &self,
        document: &str,
        task: Option<&str>,
    ) -> Result<Option<String>, AppError> {
        validate_id(document)?;
        if let Some(id) = task {
            validate_id(id)?;
        }
        let connection = self.connection()?;
        queries::snapshot(&connection, document)?;
        if let Some(id) = task {
            let belongs: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?1 AND document_id=?2)",
                    params![id, document],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if !belongs {
                return Err(AppError::invalid("이 문서의 작업을 선택해 주세요."));
            }
        }
        connection.execute(
            "INSERT INTO document_selections(document_id,task_id) VALUES(?1,?2) ON CONFLICT(document_id) DO UPDATE SET task_id=excluded.task_id",
            params![document, task],
        ).map_err(database_error)?;
        Ok(task.map(str::to_owned))
    }
}

pub(super) fn selected_document(connection: &Connection) -> Result<Option<String>, AppError> {
    connection
        .query_row(
            "SELECT document_id FROM workspace_selection WHERE singleton=1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)
}

pub(super) fn selected_task(
    connection: &Connection,
    document: &str,
    fallback: Option<&str>,
) -> Result<Option<String>, AppError> {
    let saved: Option<Option<String>> = connection
        .query_row(
            "SELECT task_id FROM document_selections WHERE document_id=?1",
            [document],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    Ok(saved.unwrap_or_else(|| fallback.map(str::to_owned)))
}
