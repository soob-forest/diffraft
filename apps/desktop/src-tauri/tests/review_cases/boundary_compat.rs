use crate::{
    boundary_safety::split_v2,
    grouping::{fixture, prepare},
    world::ReviewWorld,
};
use docreview_core::{
    domain::review::DecisionRequest,
    storage::{files, runtime::Runtime},
};

const SOURCE: &str = "aabb\ncontent\nccdd\n\nplain noise\n";
const CHANGES: &[(&str, &str)] = &[
    ("aa", "`"),
    ("bb", "``"),
    ("cc", "`"),
    ("dd", "``"),
    ("plain noise", "plain"),
];

// Reproduce the persisted payload of the previous implementation after file replacement.
fn prepared_v2_approval(w: &ReviewWorld, request: &DecisionRequest, content: &str) {
    let path = std::path::Path::new(&w.head.path);
    let temp = files::prepare_file(path, content).unwrap();
    let hash = files::content_hash(content);
    let payload = serde_json::json!({
        "request": {
            "document_id": w.head.id, "expected_version": w.head.version,
            "content": content, "operation_id": request.operation_id, "reason": "accept",
        },
        "previous": w.head,
        "version_id": w.world.runtime.id(), "event_id": w.world.runtime.id(),
        "new_hash": hash, "created_at": w.world.runtime.now_ms().unwrap(),
        "effects": {"kind": "accept", "request": request},
    });
    let db = w.world.database();
    db.execute(
        "INSERT INTO save_operations(id,document_id,old_hash,new_hash,temp_path,phase,recovery_payload,created_at) VALUES(?1,?2,?3,?4,?5,'PREPARED',?6,?7)",
        rusqlite::params![request.operation_id, w.head.id, w.head.content_hash, hash,
            temp.path().to_str().unwrap(), payload.to_string(), w.world.runtime.now_ms().unwrap()],
    ).unwrap();
    db.execute(
        "UPDATE documents SET status='RECOVERY_REQUIRED' WHERE id=?1",
        [&w.head.id],
    )
    .unwrap();
    files::replace_file(temp, path).unwrap();
}

#[test]
fn old_prepared_approval_recovers_and_unrelated_new_edits_still_work() {
    let mut w = fixture(SOURCE, CHANGES);
    split_v2(&mut w);
    w.head = w.world.store.accept_proposals(w.request(&[0])).unwrap();
    let request = w.request(&[1]);
    let old_content = "```\ncontent\nccdd\n\nplain noise\n";
    prepared_v2_approval(&w, &request, old_content);
    w.world.store.recover().unwrap();
    w.head = w.world.store.snapshot(&w.head.id).unwrap();
    assert_eq!(w.head.content, old_content);
    assert_eq!(
        w.world.store.accept_proposals(request).unwrap().version,
        w.head.version
    );
    w.head = w.world.store.accept_proposals(w.request(&[4])).unwrap();
    assert_eq!(w.head.content, old_content.replace("plain noise", "plain"));
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
}

#[test]
fn v2_conversion_failure_rolls_back_then_restart_preserves_upgraded_groups() {
    let mut w = fixture(SOURCE, CHANGES);
    split_v2(&mut w);
    let before = serde_json::to_string(&w.batch).unwrap();
    let db = w.world.database();
    db.execute_batch("CREATE TRIGGER fail_boundary BEFORE UPDATE ON patch_reviews BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    assert!(w.world.store.prepare_patch_review(prepare(&w)).is_err());
    assert_eq!(
        serde_json::to_string(&w.world.store.review_batch(&w.batch.id).unwrap()).unwrap(),
        before
    );
    db.execute_batch("DROP TRIGGER fail_boundary;").unwrap();
    let prepared = w.world.store.prepare_patch_review(prepare(&w)).unwrap();
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    let store = docreview_core::storage::Store::open(&data).unwrap();
    assert_eq!(
        serde_json::to_string(&store.review_batch(&w.batch.id).unwrap()).unwrap(),
        serde_json::to_string(&prepared).unwrap()
    );
    assert_eq!(store.snapshot(&w.head.id).unwrap().content, SOURCE);
}
