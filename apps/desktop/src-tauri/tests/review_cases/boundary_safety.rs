use crate::{
    grouping::{fixture, prepare},
    world::ReviewWorld,
};
use docreview_core::{
    domain::{annotations::RevisionRequest, error::ErrorCode},
    storage::runtime::Runtime,
};

const SOURCE: &str = "aabb\ncontent\nccdd\n\nplain noise\n";
const CHANGES: &[(&str, &str)] = &[
    ("aa", "`"),
    ("bb", "``"),
    ("cc", "`"),
    ("dd", "``"),
    ("plain noise", "plain"),
];

pub(super) fn split_v2(w: &mut ReviewWorld) {
    let db = w.world.database();
    db.execute(
        "UPDATE patch_reviews SET policy_version=2,revision=7 WHERE batch_id=?1",
        [&w.batch.id],
    )
    .unwrap();
    for p in &w.batch.proposals {
        db.execute(
            "UPDATE proposals SET group_id=?1 WHERE id=?2",
            rusqlite::params![w.world.runtime.id(), p.id],
        )
        .unwrap();
    }
    w.batch = w.world.store.review_batch(&w.batch.id).unwrap();
}

fn assert_unchanged(w: &ReviewWorld, before: &str) {
    assert_eq!(
        serde_json::to_string(&w.world.store.review_batch(&w.batch.id).unwrap()).unwrap(),
        before
    );
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version_id,
        w.head.version_id
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
}

#[test]
fn combined_structure_is_atomic_but_unrelated_correction_is_independent() {
    let mut w = fixture(SOURCE, CHANGES);
    let group = &w.batch.proposals[0].group_id;
    assert!(w.batch.proposals[..4].iter().all(|p| &p.group_id == group));
    assert_ne!(&w.batch.proposals[4].group_id, group);
    assert!(w.world.store.accept_proposals(w.request(&[0, 1])).is_err());
    assert!(w.world.store.reject_proposals(w.request(&[2, 3])).is_err());
    w.head = w
        .world
        .store
        .accept_proposals(w.request(&[0, 1, 2, 3]))
        .unwrap();
    assert_eq!(w.head.content, "```\ncontent\n```\n\nplain noise\n");
    w.world.store.reject_proposals(w.request(&[4])).unwrap();
}

#[test]
fn old_partial_v2_cannot_save_a_new_unclosed_fence_and_can_finish_safely() {
    let mut w = fixture(SOURCE, CHANGES);
    split_v2(&mut w);
    w.head = w.world.store.accept_proposals(w.request(&[0])).unwrap();
    w.batch = w.world.store.review_batch(&w.batch.id).unwrap();
    let before = serde_json::to_string(&w.batch).unwrap();
    let prepared = w.world.store.prepare_patch_review(prepare(&w)).unwrap();
    assert_eq!(serde_json::to_string(&prepared).unwrap(), before);
    let journals: u32 = w
        .world
        .database()
        .query_row("SELECT count(*) FROM save_operations", [], |r| r.get(0))
        .unwrap();
    let error = w.world.store.accept_proposals(w.request(&[1])).unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidInput);
    assert_unchanged(&w, &before);
    let after: u32 = w
        .world
        .database()
        .query_row("SELECT count(*) FROM save_operations", [], |r| r.get(0))
        .unwrap();
    assert_eq!(journals, after);
    w.head = w
        .world
        .store
        .accept_proposals(w.request(&[1, 2, 3]))
        .unwrap();
    assert_eq!(w.head.content, "```\ncontent\n```\n\nplain noise\n");
}

#[test]
fn v2_upgrade_merges_joint_structure_and_invalidates_old_requests() {
    let mut w = fixture(SOURCE, CHANGES);
    split_v2(&mut w);
    let stale = w.request(&[0]);
    w.batch = w.world.store.prepare_patch_review(prepare(&w)).unwrap();
    let meta = w.batch.patch_review.as_ref().unwrap();
    assert_eq!((meta.policy_version, meta.revision), (3, 8));
    assert!(
        w.batch.proposals[..4]
            .iter()
            .all(|p| p.group_id == w.batch.proposals[0].group_id)
    );
    assert_ne!(w.batch.proposals[0].group_id, w.batch.proposals[4].group_id);
    assert!(w.world.store.accept_proposals(stale).is_err());
    let before = serde_json::to_string(&w.batch).unwrap();
    w.world.store.prepare_patch_review(prepare(&w)).unwrap();
    assert_unchanged(&w, &before);
}

#[test]
fn removing_the_unclosed_fence_container_in_a_revision_rolls_back() {
    let mut w = fixture(
        "> ```\n> code\n\noutside noise\n",
        &[("> ```\n> code", "> ```\n> corrected")],
    );
    let before = serde_json::to_string(&w.batch).unwrap();
    let request = RevisionRequest {
        document_id: w.head.id.clone(),
        batch_id: w.batch.id.clone(),
        proposal_id: w.batch.proposals[0].id.clone(),
        expected_revision: 1,
        expected_head_id: w.head.version_id.clone(),
        after: "```\n> code".into(),
        operation_id: w.world.runtime.id(),
    };
    assert!(w.world.store.save_proposal_revision(request).is_err());
    assert_unchanged(&w, &before);
    w.head = w.world.store.accept_proposals(w.request(&[0])).unwrap();
    assert_eq!(w.head.content, "> ```\n> corrected\n\noutside noise\n");
}
