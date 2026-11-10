mod support;
use docreview_core::{
    domain::editor::TaskSnapshot,
    storage::{Store, runtime::Runtime},
};
use support::World;
const DOWNGRADE: &str = "DROP TABLE patch_reviews; DROP TABLE first_request_drafts; ALTER TABLE tasks DROP COLUMN name; PRAGMA user_version=11;";
#[test]
fn schema_11_name_backfill_keeps_goals_conditions_and_a_readable_backup() {
    let mut w = World::new();
    w.document = w.store.save(w.request()).unwrap();
    assert_eq!(w.document.content, support::SAVED_CONTENT);
    let task = w.runtime.id();
    w.store
        .put_task(TaskSnapshot {
            id: task.clone(),
            document_id: w.document.id.clone(),
            name: None,
            goal: "지속 방향".into(),
            pinned_rules: "수치 유지".into(),
            summary: "".into(),
        })
        .unwrap();
    let db = w.database();
    db.execute_batch(DOWNGRADE).unwrap();
    let data = w.directory.path().join("data");
    drop(w.store);
    let store = Store::open(&data).unwrap();
    let saved = &store.editor_state(&w.document.id).unwrap().tasks[0];
    assert_eq!(saved.name.as_deref(), Some("지속 방향"));
    assert_eq!(saved.goal, "지속 방향");
    assert_eq!(saved.pinned_rules, "수치 유지");
    let backup = std::fs::read_dir(&data)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("workspace.schema-11.")
        })
        .unwrap();
    let old = rusqlite::Connection::open(backup).unwrap();
    assert!(old.prepare("SELECT name FROM tasks").is_err());
    assert_eq!(
        old.query_row("SELECT goal FROM tasks WHERE id=?1", [task], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "지속 방향"
    );
    assert_eq!(
        store.snapshot(&w.document.id).unwrap().content,
        w.document.content
    );
}
#[test]
fn schema_12_conflict_rolls_back_name_and_keeps_the_original_database() {
    let w = World::new();
    let db = w.database();
    db.execute_batch(DOWNGRADE).unwrap();
    db.execute_batch("CREATE TABLE first_request_drafts(original TEXT); INSERT INTO first_request_drafts VALUES('preserve');").unwrap();
    let data = w.directory.path().join("data");
    drop(w.store);
    assert!(Store::open(&data).is_err());
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        11
    );
    assert!(db.prepare("SELECT name FROM tasks").is_err());
    assert_eq!(
        db.query_row("SELECT original FROM first_request_drafts", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert_eq!(std::fs::read_to_string(w.path).unwrap(), w.document.content);
}
