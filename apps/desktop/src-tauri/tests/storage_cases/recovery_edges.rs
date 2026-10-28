use crate::support::{INITIAL_CONTENT, SAVED_CONTENT, World};
use docreview_core::{
    domain::{
        document::DocumentStatus,
        error::{AppError, ErrorCode},
    },
    storage::{Store, models::SaveStage},
};
use std::{fs, sync::Arc};

#[test]
fn restart_after_external_write_preserves_recovery_payload_and_disk() {
    let world = World::new();
    let path = world.path.clone();
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::FileReplaced {
                fs::write(&path, "외부 최신 내용").unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world.store.save(world.request()).unwrap_err().code,
        ErrorCode::FileConflict
    );
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    let snapshot = store.snapshot(&world.document.id).unwrap();
    assert_eq!(snapshot.status, DocumentStatus::Conflict);
    assert_eq!(snapshot.content, INITIAL_CONTENT);
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "외부 최신 내용");
    let connection =
        rusqlite::Connection::open(world.directory.path().join("data/workspace.sqlite3")).unwrap();
    let (phase, payload): (String, String) = connection
        .query_row(
            "SELECT phase,recovery_payload FROM save_operations",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(phase, "CONFLICT");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&payload).unwrap()["request"]["content"],
        SAVED_CONTENT
    );
}

#[test]
fn restart_with_missing_prepared_file_keeps_history_and_blocks_writes() {
    let world = World::new();
    let request = world.request();
    let path = world.path.clone();
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::Prepared {
                fs::remove_file(&path).unwrap();
                return Err(AppError::new(ErrorCode::SaveFailed, "주입된 종료"));
            }
            Ok(())
        }))
        .unwrap();
    assert!(world.store.save(request.clone()).is_err());
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert!(!world.path.exists());
    assert_eq!(
        store.snapshot(&world.document.id).unwrap().status,
        DocumentStatus::Conflict
    );
    assert_eq!(
        store.version_content(&world.document.id, 1).unwrap(),
        INITIAL_CONTENT
    );
    assert_eq!(
        store.save(request).unwrap_err().code,
        ErrorCode::FileConflict
    );
}

#[test]
fn failed_migration_keeps_backup_and_original_schema() {
    let directory = tempfile::tempdir().unwrap();
    let database = directory.path().join("workspace.sqlite3");
    let connection = rusqlite::Connection::open(&database).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE documents(original TEXT); INSERT INTO documents VALUES('preserve');",
        )
        .unwrap();
    drop(connection);
    assert!(Store::open(directory.path()).is_err());
    let connection = rusqlite::Connection::open(&database).unwrap();
    let original: String = connection
        .query_row("SELECT original FROM documents", [], |row| row.get(0))
        .unwrap();
    assert_eq!(original, "preserve");
    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 0);
    assert_eq!(
        fs::read_dir(directory.path())
            .unwrap()
            .filter(|entry| entry
                .as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains("backup.sqlite3"))
            .count(),
        1
    );
}
