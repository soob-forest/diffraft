use docreview_core::{
    domain::{document::DocumentSnapshot, drafts::DraftWrite, editor::TaskSnapshot},
    storage::Store,
};
use std::{fs, path::Path};

fn fixture(version: u32) -> (tempfile::TempDir, DocumentSnapshot) {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.md");
    fs::write(&path, "\u{feff}# 합성 원문\r\n한글 😀 보존\r\n").unwrap();
    let store = Store::open(&root.path().join("data")).unwrap();
    let document = store.open_document(&path).unwrap();
    let task = uuid::Uuid::new_v4().to_string();
    store
        .put_task(TaskSnapshot {
            id: task.clone(),
            document_id: document.id.clone(),
            goal: "기존 작업".into(),
            pinned_rules: "수치 유지".into(),
            summary: String::new(),
        })
        .unwrap();
    if version == 9 {
        store
            .write_draft(DraftWrite {
                key: serde_json::to_string(&["request", &document.id, &task]).unwrap(),
                schema_version: 1,
                expected_revision: 0,
                value_json: Some("{\"instruction\":\"복원할 지시\",\"mode\":\"PATCH\"}".into()),
            })
            .unwrap();
    }
    drop(store);
    let connection =
        rusqlite::Connection::open(root.path().join("data/workspace.sqlite3")).unwrap();
    connection
        .execute_batch("DROP TABLE selection_jobs;")
        .unwrap();
    if version == 8 {
        connection.execute_batch("DROP TABLE drafts;").unwrap();
    }
    connection
        .pragma_update(None, "user_version", version)
        .unwrap();
    (root, document)
}

#[test]
fn schema_8_and_9_upgrade_preserves_source_tasks_drafts_and_restorable_backups() {
    for version in [8, 9] {
        let (root, document) = fixture(version);
        let store = Store::open(&root.path().join("data")).unwrap();
        assert_eq!(
            store.snapshot(&document.id).unwrap().content,
            document.content
        );
        assert_eq!(
            store.read_drafts().unwrap().len(),
            usize::from(version == 9)
        );
        let database =
            rusqlite::Connection::open(root.path().join("data/workspace.sqlite3")).unwrap();
        assert_eq!(
            database
                .query_row("SELECT goal FROM tasks", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "기존 작업"
        );
        assert_eq!(
            database
                .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
                .unwrap(),
            10
        );
        let backup = backup(root.path());
        let saved = rusqlite::Connection::open(&backup).unwrap();
        assert_eq!(
            saved
                .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
                .unwrap(),
            version
        );
        let restored = root.path().join("restored");
        fs::create_dir(&restored).unwrap();
        fs::copy(backup, restored.join("workspace.sqlite3")).unwrap();
        let restored = Store::open(&restored).unwrap();
        assert_eq!(
            restored.snapshot(&document.id).unwrap().content,
            document.content
        );
        assert_eq!(
            restored.read_drafts().unwrap().len(),
            usize::from(version == 9)
        );
    }
}

#[test]
fn schema_9_failure_rolls_back_without_losing_the_backup_or_existing_draft() {
    let (root, _) = fixture(9);
    let path = root.path().join("data/workspace.sqlite3");
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TABLE selection_jobs(original TEXT); INSERT INTO selection_jobs VALUES('preserve');").unwrap();
    drop(connection);
    assert!(Store::open(&root.path().join("data")).is_err());
    let connection = rusqlite::Connection::open(&path).unwrap();
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))
            .unwrap(),
        9
    );
    assert_eq!(
        connection
            .query_row("SELECT original FROM selection_jobs", [], |row| row
                .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert_eq!(
        connection
            .query_row("SELECT count(*) FROM drafts", [], |row| row
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert!(backup(root.path()).is_file());
}

fn backup(root: &Path) -> std::path::PathBuf {
    fs::read_dir(root.join("data"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| path.to_string_lossy().ends_with(".backup.sqlite3"))
        .unwrap()
}
