use crate::support::{INITIAL_CONTENT, SAVED_CONTENT, World};
use docreview_core::{
    domain::{MAX_DOCUMENT_BYTES, document::DocumentStatus, error::ErrorCode},
    storage::{Store, models::SaveStage},
};
use std::{
    fs,
    sync::{Arc, Mutex},
    time::Duration,
};

#[test]
fn external_edit_blocks_writes_and_generation_precondition() {
    let world = World::new();
    fs::write(&world.path, "외부 편집").unwrap();
    assert_eq!(
        world.store.save(world.request()).unwrap_err().code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        world
            .store
            .ensure_current(&world.document.id)
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        INITIAL_CONTENT
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "외부 편집");
}

#[test]
fn external_edit_immediately_before_replace_preserves_both_contents() {
    let world = World::new();
    let path = world.path.clone();
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::BeforeReplace {
                fs::write(&path, "경쟁 편집").unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world.store.save(world.request()).unwrap_err().code,
        ErrorCode::FileConflict
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "경쟁 편집");
    let payload: String = world
        .database()
        .query_row("SELECT recovery_payload FROM save_operations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&payload).unwrap()["request"]["content"],
        SAVED_CONTENT
    );
    world.store.recover().unwrap();
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().status,
        DocumentStatus::Conflict
    );
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 1);
}

#[test]
fn deleted_file_does_not_get_recreated() {
    let world = World::new();
    fs::remove_file(&world.path).unwrap();
    assert!(world.store.save(world.request()).is_err());
    world.store.recover().unwrap();
    assert!(!world.path.exists());
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        INITIAL_CONTENT
    );
}

#[test]
fn actual_sqlite_full_error_preserves_original_and_head() {
    let world = World::new();
    world
        .store
        .configure_database_for_test(|connection| {
            let pages: u32 = connection.pragma_query_value(None, "page_count", |row| row.get(0))?;
            connection.pragma_update(None, "max_page_count", pages)
        })
        .unwrap();
    let mut request = world.request();
    request.content = "a".repeat(MAX_DOCUMENT_BYTES);
    let error = world.store.save(request).unwrap_err();
    assert_eq!(error.code, ErrorCode::SaveFailed);
    assert!(error.message.contains("공간"));
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 1);
}

#[test]
fn database_commit_failure_after_replace_recovers_exactly_once() {
    let world = World::new();
    world
        .store
        .configure_database_for_test(|connection| connection.busy_timeout(Duration::ZERO))
        .unwrap();
    let blocker = Arc::new(Mutex::new(world.database()));
    let observer_blocker = blocker.clone();
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::FileReplaced {
                observer_blocker
                    .lock()
                    .unwrap()
                    .execute_batch("BEGIN IMMEDIATE")
                    .unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world.store.save(world.request()).unwrap_err().code,
        ErrorCode::SaveFailed
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), SAVED_CONTENT);
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().status,
        DocumentStatus::RecoveryRequired
    );
    blocker.lock().unwrap().execute_batch("ROLLBACK").unwrap();
    world.store.recover().unwrap();
    world.store.recover().unwrap();
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 2);
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        SAVED_CONTENT
    );
}

#[test]
fn newer_schema_is_rejected_before_database_writes() {
    let world = World::new();
    let data = world.directory.path().join("data");
    let version: u32 = world
        .database()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    world
        .database()
        .pragma_update(None, "user_version", version + 1)
        .unwrap();
    drop(world.store);
    let original = fs::read(data.join("workspace.sqlite3")).unwrap();
    assert!(matches!(Store::open(&data), Err(error) if error.code == ErrorCode::SchemaUnsupported));
    assert_eq!(fs::read(data.join("workspace.sqlite3")).unwrap(), original);
}

#[test]
fn existing_database_is_backed_up_before_migration() {
    let directory = tempfile::tempdir().unwrap();
    rusqlite::Connection::open(directory.path().join("workspace.sqlite3")).unwrap();
    let store = Store::open(directory.path()).unwrap();
    assert!(store.documents().unwrap().is_empty());
    let backups: Vec<_> = fs::read_dir(directory.path())
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.to_string_lossy().contains("backup.sqlite3"))
        .collect();
    assert_eq!(backups.len(), 1);
    let version: u32 = rusqlite::Connection::open(&backups[0])
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 0);
}
