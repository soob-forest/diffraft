use crate::{support, world};

use docreview_core::{
    document::scope::select,
    domain::{
        ai::{AiChange, AiResponse},
        editor::ScopeSelection,
    },
};
use docreview_core::{
    domain::{annotations::RevisionRequest, rewrite::BatchDecisionRequest},
    storage::runtime::Runtime,
};
use std::collections::HashSet;

pub(super) fn fixture(source: &str, replacements: &[(&str, &str)]) -> world::ReviewWorld {
    let w = support::World::new();
    let mut save = w.request();
    save.content = source.into();
    let head = w.store.save(save).unwrap();
    let task = world::add_task(&w, &head.id);
    let scope = select(&head, ScopeSelection::Whole).unwrap();
    let changes = replacements
        .iter()
        .map(|(before, after)| AiChange {
            block_id: scope
                .blocks
                .iter()
                .find(|b| b.text.contains(before))
                .unwrap()
                .id
                .clone(),
            before: (*before).into(),
            after: (*after).into(),
            reason: "synthetic correction".into(),
        })
        .collect();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "fixture".into(),
        changes,
    };
    let batch = world::register(&w, &head, &task, &response);
    world::ReviewWorld {
        world: w,
        head,
        task,
        batch,
    }
}

pub(super) fn prepare(w: &world::ReviewWorld) -> BatchDecisionRequest {
    BatchDecisionRequest {
        document_id: w.head.id.clone(),
        batch_id: w.batch.id.clone(),
        expected_head_id: w.head.version_id.clone(),
        operation_id: w.world.runtime.id(),
    }
}

pub(super) fn legacy(w: &mut world::ReviewWorld) {
    let db = w.world.database();
    db.execute("DELETE FROM patch_reviews WHERE batch_id=?1", [&w.batch.id])
        .unwrap();
    db.execute(
        "UPDATE proposals SET group_id=?1 WHERE batch_id=?2",
        rusqlite::params![w.batch.proposals[0].group_id, w.batch.id],
    )
    .unwrap();
    w.batch = w.world.store.review_batch(&w.batch.id).unwrap();
}

#[test]
fn real_structure_dependencies_cannot_be_partially_decided() {
    let w = fixture(
        "# Section\n\ninside noise\n\n# Other\n\noutside noise\n",
        &[
            ("# Section", "## Section"),
            ("inside noise", "inside"),
            ("outside noise", "outside"),
        ],
    );
    assert_eq!(w.batch.proposals[0].group_id, w.batch.proposals[1].group_id);
    assert_ne!(w.batch.proposals[0].group_id, w.batch.proposals[2].group_id);
    assert!(w.world.store.accept_proposals(w.request(&[0])).is_err());
    assert!(w.world.store.reject_proposals(w.request(&[1])).is_err());
    assert_eq!(
        w.world
            .store
            .accept_proposals(w.request(&[0, 1]))
            .unwrap()
            .content,
        "## Section\n\ninside\n\n# Other\n\noutside noise\n"
    );
}

#[test]
fn revision_keeps_independent_group_ids_and_rejects_old_confirmations() {
    let mut w = fixture(
        "one noise\n\n- two noise\n",
        &[("one noise", "one"), ("two noise", "two")],
    );
    let old = w.request(&[1]);
    let ids = w
        .batch
        .proposals
        .iter()
        .map(|p| p.group_id.clone())
        .collect::<Vec<_>>();
    let request = RevisionRequest {
        document_id: w.head.id.clone(),
        batch_id: w.batch.id.clone(),
        proposal_id: w.batch.proposals[0].id.clone(),
        expected_revision: 1,
        expected_head_id: w.head.version_id.clone(),
        after: "one corrected".into(),
        operation_id: w.world.runtime.id(),
    };
    w.batch = w.world.store.save_proposal_revision(request).unwrap();
    assert_eq!(
        w.batch
            .proposals
            .iter()
            .map(|p| p.group_id.clone())
            .collect::<Vec<_>>(),
        ids
    );
    assert_eq!(w.batch.patch_review.as_ref().unwrap().revision, 2);
    assert!(w.world.store.accept_proposals(old).is_err());
    w.head = w.world.store.accept_proposals(w.request(&[0])).unwrap();
    assert_eq!(w.head.content, "one corrected\n\n- two noise\n");
    w.world.store.reject_proposals(w.request(&[1])).unwrap();
}

#[test]
fn legacy_preparation_is_once_and_persists_ids_after_restart() {
    let mut w = fixture(
        "one noise\n\n- two noise\n",
        &[("one noise", "one"), ("two noise", "two")],
    );
    legacy(&mut w);
    let old = w.request(&[0, 1]);
    let request = prepare(&w);
    let prepared = w.world.store.prepare_patch_review(request.clone()).unwrap();
    assert_ne!(
        prepared.proposals[0].group_id,
        prepared.proposals[1].group_id
    );
    assert!(w.world.store.accept_proposals(old).is_err());
    let again = w.world.store.prepare_patch_review(request).unwrap();
    assert_eq!(
        serde_json::to_value(&prepared).unwrap(),
        serde_json::to_value(again).unwrap()
    );
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    let store = docreview_core::storage::Store::open(&data).unwrap();
    assert_eq!(
        serde_json::to_value(prepared).unwrap(),
        serde_json::to_value(store.review_batch(&w.batch.id).unwrap()).unwrap()
    );
    assert_eq!(
        std::fs::read_to_string(w.world.path).unwrap(),
        w.head.content
    );
}

#[test]
fn failed_preparation_rolls_back_and_retry_does_not_duplicate_events() {
    let mut w = fixture(
        "one noise\n\n- two noise\n",
        &[("one noise", "one"), ("two noise", "two")],
    );
    legacy(&mut w);
    let db = w.world.database();
    db.execute_batch("CREATE TRIGGER fail_groups BEFORE INSERT ON patch_reviews BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    let request = prepare(&w);
    assert!(w.world.store.prepare_patch_review(request.clone()).is_err());
    let unchanged = w.world.store.review_batch(&w.batch.id).unwrap();
    assert!(unchanged.patch_review.is_none());
    assert_eq!(
        unchanged.proposals[0].group_id,
        unchanged.proposals[1].group_id
    );
    db.execute_batch("DROP TRIGGER fail_groups;").unwrap();
    w.world.store.prepare_patch_review(request.clone()).unwrap();
    w.world.store.prepare_patch_review(request).unwrap();
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM decision_events WHERE kind='patch_review_prepare'",
            [],
            |r| r.get::<_, u32>(0)
        )
        .unwrap(),
        1
    );
}

#[test]
fn legacy_partial_decisions_are_not_automatically_reclassified() {
    let mut w = fixture(
        "one noise\n\n- two noise\n",
        &[("one noise", "one"), ("two noise", "two")],
    );
    w.world.store.reject_proposals(w.request(&[0])).unwrap();
    legacy(&mut w);
    let before = serde_json::to_value(&w.batch).unwrap();
    assert_eq!(
        before,
        serde_json::to_value(w.world.store.prepare_patch_review(prepare(&w)).unwrap()).unwrap()
    );
    assert!(
        w.world
            .store
            .review_batch(&w.batch.id)
            .unwrap()
            .patch_review
            .is_none()
    );
}

#[test]
fn independent_multiline_and_list_deletions_have_four_approval_groups() {
    let w = support::World::new();
    let mut save = w.request();
    save.content =
        "alpha noise\n\n- beta noise\n\n## Section\n\ngamma noise\n\n1. delta noise\n".into();
    let head = w.store.save(save).unwrap();
    let task = world::add_task(&w, &head.id);
    let scope = select(&head, ScopeSelection::Whole).unwrap();
    let changes = scope
        .blocks
        .iter()
        .filter(|b| b.text.contains("noise"))
        .map(|b| AiChange {
            block_id: b.id.clone(),
            before: b.text.clone(),
            after: b.text.replace(" noise", ""),
            reason: "Remove filler".into(),
        })
        .collect();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "Four deletions".into(),
        changes,
    };
    let batch = world::register(&w, &head, &task, &response);
    assert_eq!(batch.proposals.len(), 4);
    assert_eq!(
        batch
            .proposals
            .iter()
            .map(|p| &p.group_id)
            .collect::<HashSet<_>>()
            .len(),
        4
    );
    assert_eq!(std::fs::read_to_string(&w.path).unwrap(), head.content);
}
