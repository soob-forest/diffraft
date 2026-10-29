#[cfg(feature = "desktop")]
pub mod connection;
#[cfg(feature = "desktop")]
pub mod desktop;
#[cfg(feature = "e2e")]
pub mod e2e;
#[cfg(feature = "e2e")]
pub mod e2e_connection;
#[cfg(feature = "e2e")]
pub mod e2e_export;
#[cfg(feature = "e2e")]
pub mod e2e_generation;
#[cfg(feature = "desktop")]
pub mod export;
#[cfg(feature = "desktop")]
pub mod generation;
pub mod history;
#[cfg(feature = "desktop")]
pub mod model_settings;
#[cfg(feature = "desktop")]
pub mod regeneration;
pub mod review;
#[cfg(feature = "desktop")]
pub mod rewrite;

use crate::{
    domain::{
        editor::{EditorAction, EditorReply, EditorRequest},
        error::AppError,
        ipc::{AppSnapshot, SnapshotRequest},
    },
    storage::{
        Store,
        models::{SaveReason, SaveRequest},
    },
};

pub fn workspace(store: &Store, request: SnapshotRequest) -> Result<AppSnapshot, AppError> {
    request.validate()?;
    store.workspace()
}

pub fn editor(store: &Store, request: EditorRequest) -> Result<EditorReply, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    dispatch_editor(store, request.action)
}

fn dispatch_editor(store: &Store, action: EditorAction) -> Result<EditorReply, AppError> {
    match action {
        EditorAction::SelectDocument { document_id } => {
            store.select_document(&document_id).map(EditorReply::State)
        }
        EditorAction::SelectTask {
            document_id,
            task_id,
        } => store
            .select_task(&document_id, task_id.as_deref())
            .map(EditorReply::SelectedTask),
        EditorAction::CommonRules { document_id, rules } => store
            .common_rules(&document_id, rules.as_deref())
            .map(EditorReply::Rules),
        EditorAction::Read { document_id } => {
            store.editor_state(&document_id).map(EditorReply::State)
        }
        EditorAction::Check { document_id } => store
            .ensure_current(&document_id)
            .map(EditorReply::Document),
        EditorAction::Save {
            document_id,
            expected_version,
            content,
            operation_id,
        } => store
            .save(SaveRequest {
                document_id,
                expected_version,
                content,
                operation_id,
                reason: SaveReason::Edit,
            })
            .map(EditorReply::Document),
        EditorAction::PutTask { task } => store.put_task(task).map(EditorReply::Task),
        EditorAction::Scope {
            document_id,
            expected_version,
            selection,
        } => store
            .scope(&document_id, expected_version, selection)
            .map(EditorReply::Scope),
    }
}
pub mod conflict;
