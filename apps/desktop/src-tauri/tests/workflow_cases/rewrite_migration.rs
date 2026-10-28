use crate::support::World;
use docreview_core::storage::Store;

#[test]
fn v3_migrates_to_rewrite_jobs_after_backup_without_losing_versions() {
    let world = World::new();
    world.store.save(world.request()).unwrap();
    crate::generation_migration::remove_generation_schema(&world);
    world
        .database()
        .execute_batch("DROP TABLE rewrite_jobs; PRAGMA user_version=3;")
        .unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    let store = Store::open(&data).unwrap();
    assert_eq!(store.snapshot(&world.document.id).unwrap().version, 2);
    assert!(std::fs::read_dir(&data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-3.")
    }));
    store
        .configure_database_for_test(|db| {
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))?,
                6
            );
            db.prepare("SELECT request_json,context_json FROM rewrite_jobs")?;
            Ok(())
        })
        .unwrap();
}

#[test]
fn failed_rewrite_migration_retains_original_schema_and_backup() {
    let world = World::new();
    crate::generation_migration::remove_generation_schema(&world);
    world.database().execute_batch("DROP TABLE rewrite_jobs; CREATE TABLE rewrite_jobs(original TEXT); INSERT INTO rewrite_jobs VALUES('preserve'); PRAGMA user_version=3;").unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    assert!(Store::open(&data).is_err());
    let db = rusqlite::Connection::open(data.join("workspace.sqlite3")).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        3
    );
    assert_eq!(
        db.query_row("SELECT original FROM rewrite_jobs", [], |row| row
            .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert!(std::fs::read_dir(&data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-3.")
    }));
}
