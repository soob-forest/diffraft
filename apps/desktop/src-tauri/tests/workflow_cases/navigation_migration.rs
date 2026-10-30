use crate::{support::World, world::add_task};
use docreview_core::storage::Store;

pub fn remove_navigation_schema(world: &World) {
    world.database().execute_batch("ALTER TABLE job_executions DROP COLUMN requested_model; DROP TABLE document_selections; DROP TABLE workspace_selection; DROP INDEX task_document_identity;").unwrap();
}

#[test]
fn v5_navigation_migration_preserves_versions_tasks_and_messages_and_keeps_backup() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    world.store.save(world.request()).unwrap();
    world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES('legacy',?1,1,'USER','보존할 대화',0)", [&task]).unwrap();
    remove_navigation_schema(&world);
    world
        .database()
        .pragma_update(None, "user_version", 5)
        .unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    let store = Store::open(&data).unwrap();
    assert_eq!(store.versions(&world.document.id).unwrap().len(), 2);
    assert_eq!(
        store
            .editor_state(&world.document.id)
            .unwrap()
            .selected_task_id,
        Some(task)
    );
    assert_migrated_messages(&store);
    assert_backup(&data);
}

fn assert_migrated_messages(store: &Store) {
    store
        .configure_database_for_test(|db| {
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))?,
                7
            );
            assert_eq!(
                db.query_row(
                    "SELECT content FROM messages WHERE id='legacy'",
                    [],
                    |row| row.get::<_, String>(0)
                )?,
                "보존할 대화"
            );
            Ok(())
        })
        .unwrap();
}

fn assert_backup(data: &std::path::Path) {
    let backup = rusqlite::Connection::open(backup_path(data)).unwrap();
    assert_eq!(
        backup
            .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        5
    );
    assert_eq!(
        backup
            .query_row("SELECT COUNT(*) FROM versions", [], |row| row
                .get::<_, u32>(0))
            .unwrap(),
        2
    );
}

#[test]
fn navigation_migration_failure_rolls_back_schema_and_preserves_backup() {
    let world = World::new();
    remove_navigation_schema(&world);
    world.database().execute_batch("CREATE TABLE document_selections(original TEXT); INSERT INTO document_selections VALUES('preserve'); PRAGMA user_version=5;").unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    assert!(Store::open(&data).is_err());
    let db = rusqlite::Connection::open(data.join("workspace.sqlite3")).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        5
    );
    assert_eq!(
        db.query_row("SELECT original FROM document_selections", [], |row| row
            .get::<_, String>(
            0
        ))
        .unwrap(),
        "preserve"
    );
    assert!(
        db.prepare("SELECT document_id FROM workspace_selection")
            .is_err()
    );
    assert_eq!(
        db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='task_document_identity'",
            [],
            |row| row.get::<_, u32>(0)
        )
        .unwrap(),
        0
    );
    assert!(backup_path(&data).exists());
}

fn backup_path(data: &std::path::Path) -> std::path::PathBuf {
    std::fs::read_dir(data)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("workspace.schema-5.")
        })
        .unwrap()
}
