use crate::grouping::{fixture, legacy, prepare};
use docreview_core::{
    domain::annotations::RevisionRequest,
    storage::{Store, runtime::Runtime},
};

const SOURCE: &str = "# Section\n\ninside noise\n\n# Other\n\noutside noise\n";
const CHANGES: &[(&str, &str)] = &[
    ("# Section", "# Heading"),
    ("inside noise", "inside"),
    ("outside noise", "outside"),
];

#[test]
fn reference_and_move_groups_reject_partial_accept_and_reject() {
    let cases = [
        (
            "[Old][id]\n\nanchor\n\n[id]: /old\n\nplain noise\n",
            [
                ("[Old][id]", "[New][next]"),
                ("anchor", "anchor\n\n[next]: /new"),
                ("plain noise", "plain"),
            ],
        ),
        (
            "moved paragraph\n\nkeep here\n\nplain noise\n",
            [
                ("moved paragraph", ""),
                ("keep here", "keep here\n\nmoved paragraph"),
                ("plain noise", "plain"),
            ],
        ),
    ];
    for (source, changes) in cases {
        let w = fixture(source, &changes);
        assert_eq!(w.batch.proposals[0].group_id, w.batch.proposals[1].group_id);
        assert_ne!(w.batch.proposals[0].group_id, w.batch.proposals[2].group_id);
        assert!(w.world.store.accept_proposals(w.request(&[0])).is_err());
        assert!(w.world.store.reject_proposals(w.request(&[1])).is_err());
        assert_eq!(std::fs::read_to_string(&w.world.path).unwrap(), source);
    }
}

#[test]
fn competing_preparations_commit_only_once() {
    let mut w = fixture(SOURCE, CHANGES);
    legacy(&mut w);
    let results = std::thread::scope(|s| {
        let left = s.spawn(|| w.world.store.prepare_patch_review(prepare(&w)).unwrap());
        let right = s.spawn(|| w.world.store.prepare_patch_review(prepare(&w)).unwrap());
        (left.join().unwrap(), right.join().unwrap())
    });
    assert_eq!(
        serde_json::to_value(results.0).unwrap(),
        serde_json::to_value(results.1).unwrap()
    );
    assert_eq!(
        w.world
            .database()
            .query_row(
                "SELECT count(*) FROM decision_events WHERE kind='patch_review_prepare'",
                [],
                |r| r.get::<_, u32>(0)
            )
            .unwrap(),
        1
    );
}

#[test]
fn revision_cannot_depend_on_a_rejected_change_but_can_use_an_accepted_one() {
    for accepted in [false, true] {
        let mut w = fixture(SOURCE, CHANGES);
        if accepted {
            w.head = w.world.store.accept_proposals(w.request(&[1])).unwrap();
        } else {
            w.world.store.reject_proposals(w.request(&[1])).unwrap();
        }
        w.batch = w.world.store.review_batch(&w.batch.id).unwrap();
        let before = serde_json::to_value(&w.batch).unwrap();
        let request = RevisionRequest {
            document_id: w.head.id.clone(),
            batch_id: w.batch.id.clone(),
            proposal_id: w.batch.proposals[0].id.clone(),
            expected_revision: 1,
            expected_head_id: w.head.version_id.clone(),
            after: "## Heading".into(),
            operation_id: w.world.runtime.id(),
        };
        let result = w.world.store.save_proposal_revision(request);
        assert_eq!(result.is_ok(), accepted);
        if !accepted {
            assert_eq!(
                serde_json::to_value(w.world.store.review_batch(&w.batch.id).unwrap()).unwrap(),
                before
            );
        }
    }
}

#[test]
fn schema_12_upgrade_preserves_groups_and_creates_backup_before_conversion() {
    let mut w = fixture(SOURCE, CHANGES);
    legacy(&mut w);
    let db = w.world.database();
    db.execute_batch("DROP TABLE patch_reviews; PRAGMA user_version=12;")
        .unwrap();
    let request = prepare(&w);
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    let store = Store::open(&data).unwrap();
    assert!(
        store
            .review_batch(&w.batch.id)
            .unwrap()
            .patch_review
            .is_none()
    );
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        13
    );
    assert!(std::fs::read_dir(&data).unwrap().any(|p| {
        p.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-12.")
    }));
    assert_eq!(
        store
            .prepare_patch_review(request)
            .unwrap()
            .patch_review
            .unwrap()
            .revision,
        1
    );
    assert_eq!(store.snapshot(&w.head.id).unwrap().content, SOURCE);
}

#[test]
fn schema_13_conflict_rolls_back_and_keeps_the_original_database() {
    let w = fixture(SOURCE, CHANGES);
    let db = w.world.database();
    db.execute_batch("DROP TABLE patch_reviews; CREATE TABLE patch_reviews(original TEXT); INSERT INTO patch_reviews VALUES('preserve'); PRAGMA user_version=12;").unwrap();
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    assert!(Store::open(&data).is_err());
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        12
    );
    assert_eq!(
        db.query_row("SELECT original FROM patch_reviews", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert_eq!(std::fs::read_to_string(w.world.path).unwrap(), SOURCE);
}
