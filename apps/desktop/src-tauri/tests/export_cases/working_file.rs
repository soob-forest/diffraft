use crate::{
    request,
    support::{INITIAL_CONTENT, SAVED_CONTENT, World},
    world::add_task,
};
use docreview_core::{
    domain::{
        error::ErrorCode,
        export::{ExportFileKind, ExportFileRequest},
    },
    storage::{Store, export_files::ExportDestination},
};
use std::fs;

#[test]
fn save_as_preserves_ids_history_and_old_file_and_resumes_new_path() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let path = world.directory.path().join("new-work.md");
    let action = ExportFileRequest {
        snapshot: request(&world.document),
        kind: ExportFileKind::WorkingFile,
    };
    let saved = world
        .store
        .export_file(&action, &ExportDestination::selected(&path).unwrap())
        .unwrap();
    assert_eq!(saved.document.id, world.document.id);
    assert_eq!(saved.document.version_id, world.document.version_id);
    assert_eq!(
        saved.document.path,
        fs::canonicalize(&path).unwrap().to_str().unwrap()
    );
    assert_eq!(
        world.store.editor_state(&saved.document.id).unwrap().tasks[0].id,
        task
    );
    assert_eq!(world.store.versions(&saved.document.id).unwrap().len(), 1);
    let next = world.request();
    world.store.save(next).unwrap();
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
    assert_eq!(fs::read_to_string(&path).unwrap(), SAVED_CONTENT);
    drop(world.store);
    assert_reopened(
        &world.directory.path().join("data"),
        &world.document.id,
        &task,
        &path,
    );
}

fn assert_reopened(data: &std::path::Path, id: &str, task: &str, path: &std::path::Path) {
    let store = Store::open(data).unwrap();
    let recovered = store.ensure_current(id).unwrap();
    assert_eq!(
        recovered.path,
        fs::canonicalize(path).unwrap().to_str().unwrap()
    );
    assert_eq!(recovered.content, SAVED_CONTENT);
    assert_eq!(store.editor_state(&recovered.id).unwrap().tasks[0].id, task);
}

#[test]
fn concurrent_path_change_is_rejected_before_writing() {
    let world = World::new();
    let action = ExportFileRequest {
        snapshot: request(&world.document),
        kind: ExportFileKind::WorkingFile,
    };
    let first = world.directory.path().join("first.md");
    world
        .store
        .export_file(&action, &ExportDestination::selected(&first).unwrap())
        .unwrap();
    let next = world.directory.path().join("second.md");
    assert_eq!(
        world
            .store
            .export_file(&action, &ExportDestination::selected(&next).unwrap())
            .unwrap_err()
            .code,
        ErrorCode::StaleBase
    );
    assert!(!next.exists());
}

#[test]
fn failed_binding_keeps_original_binding_and_both_files_after_restart() {
    let world = World::new();
    world.database().execute_batch("CREATE TRIGGER fail_path_change BEFORE UPDATE OF canonical_path ON documents BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    let path = world.directory.path().join("new-work.md");
    let action = ExportFileRequest {
        snapshot: request(&world.document),
        kind: ExportFileKind::WorkingFile,
    };
    let error = world
        .store
        .export_file(&action, &ExportDestination::selected(&path).unwrap())
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::SaveFailed);
    assert!(error.message.contains("사본 파일은 저장"));
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
    assert_eq!(fs::read_to_string(&path).unwrap(), INITIAL_CONTENT);
    let count: u32 = world
        .database()
        .query_row(
            "SELECT COUNT(*) FROM decision_events WHERE kind='working_file_changed'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(
        store.ensure_current(&world.document.id).unwrap().path,
        world.document.path
    );
}
