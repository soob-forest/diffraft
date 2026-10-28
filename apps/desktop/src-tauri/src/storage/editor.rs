use super::{
    Store,
    errors::{database_error, file_error},
    files, navigation, queries,
};
use crate::{
    document::{parse::analyze, scope::select},
    domain::{
        SCHEMA_VERSION,
        document::{DocumentSnapshot, validate_id},
        editor::{EditorState, ScopeSelection, ScopeSnapshot, TaskSnapshot},
        error::{AppError, ErrorCode},
        ipc::AppSnapshot,
    },
};
use rusqlite::params;
use std::{fs::OpenOptions, os::unix::fs::OpenOptionsExt, path::Path};

const MAX_GOAL_BYTES: usize = 4096;
const MAX_RULES_BYTES: usize = 16 * 1024;

impl Store {
    pub fn workspace(&self) -> Result<AppSnapshot, AppError> {
        let connection = self.connection()?;
        Ok(AppSnapshot {
            schema_version: SCHEMA_VERSION,
            sequence: queries::next_sequence(&connection)? - 1,
            documents: queries::summaries(&connection)?,
            selected_document_id: navigation::selected_document(&connection)?,
        })
    }

    pub fn editor_state(&self, id: &str) -> Result<EditorState, AppError> {
        validate_id(id)?;
        let connection = self.connection()?;
        read_state(&connection, id)
    }

    pub fn scope(
        &self,
        id: &str,
        version: u32,
        selection: ScopeSelection,
    ) -> Result<ScopeSnapshot, AppError> {
        let document = self.ensure_current(id)?;
        if document.version != version {
            return Err(AppError::new(
                ErrorCode::StaleBase,
                "문서 버전이 변경되었습니다. 저장 후 범위를 다시 선택해 주세요.",
            ));
        }
        select(&document, selection)
    }

    pub fn put_task(&self, task: TaskSnapshot) -> Result<TaskSnapshot, AppError> {
        validate_task(&task)?;
        let connection = self.connection()?;
        queries::snapshot(&connection, &task.document_id)?;
        let changed = connection.execute(
            "INSERT INTO tasks(id,document_id,goal,pinned_rules,created_at,summary_event_seq) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET goal=excluded.goal,pinned_rules=excluded.pinned_rules WHERE tasks.document_id=excluded.document_id",
            params![task.id, task.document_id, task.goal, task.pinned_rules, self.runtime.now_ms()?, queries::next_sequence(&connection)? - 1],
        ).map_err(database_error)?;
        if changed != 1 {
            return Err(AppError::invalid("다른 문서의 작업을 변경할 수 없습니다."));
        }
        tasks(&connection, &task.document_id)?
            .into_iter()
            .find(|value| value.id == task.id)
            .ok_or_else(|| AppError::invalid("작업을 찾을 수 없습니다."))
    }

    pub fn create_document(&self, path: &Path) -> Result<DocumentSnapshot, AppError> {
        if !path.is_absolute()
            || path.to_str().is_none()
            || !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            return Err(AppError::invalid(
                "UTF-8 절대 경로의 .md 파일 이름을 선택해 주세요.",
            ));
        }
        let parent = path
            .parent()
            .ok_or_else(|| AppError::invalid("저장 폴더가 없습니다."))?;
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(path)
            .map_err(file_error)?;
        files::sync_file(&file)?;
        files::sync_directory(parent)?;
        self.open_document(path)
    }
}

pub(super) fn read_state(
    connection: &rusqlite::Connection,
    id: &str,
) -> Result<EditorState, AppError> {
    let document = queries::snapshot(connection, id)?;
    let tasks = tasks(connection, id)?;
    Ok(EditorState {
        headings: analyze(&document.content).headings,
        selected_task_id: navigation::selected_task(
            connection,
            id,
            tasks.first().map(|task| task.id.as_str()),
        )?,
        tasks,
        versions: queries::versions(connection, id)?,
        document,
    })
}

fn validate_task(task: &TaskSnapshot) -> Result<(), AppError> {
    validate_id(&task.id)?;
    validate_id(&task.document_id)?;
    if task.goal.trim().is_empty()
        || task.goal.len() > MAX_GOAL_BYTES
        || task.pinned_rules.len() > MAX_RULES_BYTES
        || task.goal.contains('\0')
        || task.pinned_rules.contains('\0')
        || !task.summary.is_empty()
    {
        return Err(AppError::invalid(
            "작업 목표는 1~4,096바이트, 고정 조건은 16 KiB 이내로 입력해 주세요. 요약은 직접 변경할 수 없습니다.",
        ));
    }
    Ok(())
}

fn tasks(connection: &rusqlite::Connection, document: &str) -> Result<Vec<TaskSnapshot>, AppError> {
    let mut statement = connection.prepare("SELECT id,document_id,goal,pinned_rules,summary FROM tasks WHERE document_id=?1 ORDER BY created_at,id").map_err(database_error)?;
    statement
        .query_map([document], |row| {
            Ok(TaskSnapshot {
                id: row.get(0)?,
                document_id: row.get(1)?,
                goal: row.get(2)?,
                pinned_rules: row.get(3)?,
                summary: row.get(4)?,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}
