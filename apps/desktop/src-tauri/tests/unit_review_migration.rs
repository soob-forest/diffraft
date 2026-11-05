#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::{domain::unit_review::ReviewMode, storage::Store};
use fixture::UnitWorld;
const DOWNGRADE: &str = "DROP TABLE unit_comments; DROP TABLE review_units; DROP TABLE review_plans; ALTER TABLE proposal_batches DROP COLUMN review_mode; PRAGMA user_version=10;";

#[test]
fn schema_10_upgrade_preserves_candidates_jobs_and_source_with_backup() {
    for mode in ["PATCH", "REWRITE"] {
        let w = UnitWorld::source();
        let db = w.world.database();
        db.execute("UPDATE proposal_batches SET mode=?1", [mode])
            .unwrap();
        db.execute_batch(DOWNGRADE).unwrap();
        let data = w.world.store.directory().to_owned();
        drop(w.world.store);
        let store = Store::open(&data).unwrap();
        let batch = store.review_batch(&w.batch.id).unwrap();
        assert_eq!(batch.mode, mode);
        assert_eq!(
            batch.review_mode,
            if mode == "PATCH" {
                ReviewMode::Changes
            } else {
                ReviewMode::Whole
            }
        );
        assert_eq!(batch.candidate_markdown, w.batch.candidate_markdown);
        assert_eq!(store.snapshot(&w.head.id).unwrap().content, w.head.content);
        assert_eq!(
            db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            11
        );
        assert_backup(&data);
        assert_eq!(
            std::fs::read_to_string(&w.world.path).unwrap(),
            w.head.content
        );
    }
}

#[test]
fn migration_conflict_rolls_back_column_and_preserves_history() {
    let w = UnitWorld::source();
    let db = w.world.database();
    db.execute_batch(DOWNGRADE).unwrap();
    db.execute_batch(
        "CREATE TABLE review_plans(original TEXT); INSERT INTO review_plans VALUES('preserve');",
    )
    .unwrap();
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    assert!(Store::open(&data).is_err());
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        10
    );
    assert!(
        db.prepare("SELECT review_mode FROM proposal_batches")
            .is_err()
    );
    assert_eq!(
        db.query_row("SELECT original FROM review_plans", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
}

fn assert_backup(data: &std::path::Path) {
    let backup = std::fs::read_dir(data)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("workspace.schema-10.")
        })
        .unwrap();
    let saved = rusqlite::Connection::open(backup).unwrap();
    assert_eq!(
        saved
            .pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        10
    );
    assert_eq!(
        saved
            .query_row("SELECT COUNT(*) FROM proposal_batches", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
}
