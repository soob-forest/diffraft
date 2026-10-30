use crate::support::World;
use docreview_core::storage::Store;

fn downgrade_to_v1(world: &World) {
    crate::generation_migration::remove_generation_schema(world);
    world.database().execute_batch("DROP TABLE rewrite_jobs; DROP TABLE revision_jobs; DROP TABLE conflict_snapshots; ALTER TABLE comments DROP COLUMN revision; PRAGMA user_version=1;").unwrap();
}

#[test]
fn v1_database_migrates_with_backup_and_preserves_document_versions() {
    let world = World::new();
    let head = world.store.save(world.request()).unwrap();
    downgrade_to_v1(&world);
    drop(world.store);
    let data = world.directory.path().join("data");
    let store = Store::open(&data).unwrap();
    assert_eq!(store.snapshot(&head.id).unwrap().content, head.content);
    assert_eq!(store.versions(&head.id).unwrap().len(), 2);
    assert!(std::fs::read_dir(&data).unwrap().any(|e| {
        e.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-1.")
    }));
}

#[test]
fn v2_migration_failure_rolls_back_alter_and_retains_backup() {
    let world = World::new();
    downgrade_to_v1(&world);
    world.database().execute_batch("CREATE TABLE conflict_snapshots(original TEXT); INSERT INTO conflict_snapshots VALUES('preserve');").unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    assert!(Store::open(&data).is_err());
    let db = rusqlite::Connection::open(data.join("workspace.sqlite3")).unwrap();
    let version: u32 = db
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 1);
    assert!(db.prepare("SELECT revision FROM comments").is_err());
    assert_eq!(
        db.query_row("SELECT original FROM conflict_snapshots", [], |row| row
            .get::<_, String>(
            0
        ))
        .unwrap(),
        "preserve"
    );
}

#[test]
fn v2_to_current_preserves_head_and_creates_a_backup_before_job_schemas() {
    let world = World::new();
    crate::generation_migration::remove_generation_schema(&world);
    world
        .database()
        .execute_batch("DROP TABLE rewrite_jobs; DROP TABLE revision_jobs; PRAGMA user_version=2;")
        .unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    let store = Store::open(&data).unwrap();
    assert_eq!(
        store.snapshot(&world.document.id).unwrap().content,
        world.document.content
    );
    assert!(std::fs::read_dir(&data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-2.")
    }));
    store
        .configure_database_for_test(|db| {
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))?,
                7
            );
            db.prepare("SELECT request_json,context_json,response_json FROM revision_jobs")?;
            Ok(())
        })
        .unwrap();
}

#[test]
fn v3_migration_failure_retains_original_schema_and_backup() {
    let world = World::new();
    crate::generation_migration::remove_generation_schema(&world);
    world.database().execute_batch("DROP TABLE rewrite_jobs; DROP TABLE revision_jobs; CREATE TABLE revision_jobs(original TEXT); INSERT INTO revision_jobs VALUES('preserve'); PRAGMA user_version=2;").unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    assert!(Store::open(&data).is_err());
    let db = rusqlite::Connection::open(data.join("workspace.sqlite3")).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        db.query_row("SELECT original FROM revision_jobs", [], |row| row
            .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert!(std::fs::read_dir(&data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-2.")
    }));
}
