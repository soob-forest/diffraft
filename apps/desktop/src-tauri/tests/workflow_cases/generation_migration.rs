use crate::support::World;
use docreview_core::storage::Store;

pub fn remove_generation_schema(world: &World) {
    crate::navigation_migration::remove_navigation_schema(world);
    world.database().execute_batch("DROP INDEX session_owner; DROP INDEX one_message_per_job_role; ALTER TABLE messages DROP COLUMN job_id; DROP TABLE job_executions; DROP TABLE generation_jobs;").unwrap();
}

#[test]
fn v4_migrates_after_backup_and_preserves_existing_messages() {
    let world = World::new();
    let task = crate::world::add_task(&world, &world.document.id);
    world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES('legacy',?1,1,'USER','보존할 대화',0)", [&task]).unwrap();
    crate::generation_migration::remove_generation_schema(&world);
    world
        .database()
        .pragma_update(None, "user_version", 4)
        .unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    let store = Store::open(&data).unwrap();
    store
        .configure_database_for_test(|db| {
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))?,
                7
            );
            assert_eq!(
                db.query_row(
                    "SELECT content FROM messages WHERE id='legacy' AND job_id IS NULL",
                    [],
                    |row| row.get::<_, String>(0)
                )?,
                "보존할 대화"
            );
            db.prepare(
                "SELECT mode,requested_session_id,response_session_id,retry_of FROM job_executions",
            )?;
            Ok(())
        })
        .unwrap();
    assert!(std::fs::read_dir(data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-4.")
    }));
}

#[test]
fn conflicting_session_owner_rolls_back_entire_migration_and_preserves_backup() {
    let world = World::new();
    let task = crate::world::add_task(&world, &world.document.id);
    let other = crate::world::add_task(&world, &world.document.id);
    crate::generation_migration::remove_generation_schema(&world);
    let db = world.database();
    for (id, task) in [("first", task), ("second", other)] {
        db.execute("INSERT INTO session_bindings VALUES(?1,?2,'same-session','/private/test','2.1.311','ACTIVE',0)", [id,&task]).unwrap();
    }
    db.pragma_update(None, "user_version", 4).unwrap();
    drop(world.store);
    let data = world.directory.path().join("data");
    assert!(Store::open(&data).is_err());
    assert_eq!(
        db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        4
    );
    assert!(db.prepare("SELECT job_id FROM messages").is_err());
    assert!(db.prepare("SELECT job_id FROM generation_jobs").is_err());
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM session_bindings", [], |row| row
            .get::<_, u32>(0))
            .unwrap(),
        2
    );
    assert!(std::fs::read_dir(data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-4.")
    }));
}
