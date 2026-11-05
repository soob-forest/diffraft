#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::{
    domain::{annotations::RevisionRequest, regeneration::RegenerateRequest, review::Decision},
    storage::runtime::Runtime,
};
use fixture::UnitWorld;

#[test]
fn grouped_move_requires_all_members_and_frozen_operations_cannot_be_edited() {
    let w = UnitWorld::new(
        "# 문서\n\n이동할 문단\n\n고정 하나\n\n고정 둘\n\n끝\n",
        "# 문서\n\n고정 하나\n\n고정 둘\n\n이동할 문단\n\n끝\n",
    );
    let batch = w.start();
    assert_eq!(batch.review_units[0].proposals.len(), 2);
    let mut incomplete = w.decision(0);
    incomplete.proposals.pop();
    assert!(w.world.store.accept_proposals(incomplete.clone()).is_err());
    assert!(w.world.store.reject_proposals(incomplete).is_err());
    let p = &batch.proposals[0];
    let revision = RevisionRequest {
        document_id: w.head.id.clone(),
        batch_id: batch.id.clone(),
        proposal_id: p.id.clone(),
        expected_revision: 1,
        expected_head_id: w.head.version_id.clone(),
        operation_id: w.world.runtime.id(),
        after: "수정 우회".into(),
    };
    assert!(w.world.store.save_proposal_revision(revision).is_err());
    let regenerate = RegenerateRequest {
        model: docreview_core::domain::model::ModelSelection::CliDefault.into(),
        document_id: w.head.id.clone(),
        batch_id: batch.id,
        proposal_id: p.id.clone(),
        expected_revision: 1,
        expected_head_id: w.head.version_id.clone(),
        operation_id: w.world.runtime.id(),
        instruction: "재제안 우회".into(),
        retry_of: None,
        options: None,
    };
    assert!(w.world.store.begin_regeneration(regenerate).is_err());
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().content,
        w.head.content
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
}

#[test]
fn external_edit_and_stale_round_never_apply_or_reopen() {
    let w = UnitWorld::source();
    w.start();
    let old = w.decision(0);
    w.world.store.reject_proposals(old.clone()).unwrap();
    let request = w.reopen(0);
    w.world.store.reopen_unit_review(request.clone()).unwrap();
    let mut stale = request;
    stale.operation_id = w.world.runtime.id();
    assert!(w.world.store.reopen_unit_review(stale).is_err());
    assert!(w.world.store.accept_proposals(old).is_err());
    assert_eq!(w.current().proposals[0].decision, Decision::Pending);
    std::fs::write(&w.world.path, "외부 수정\n").unwrap();
    assert!(w.world.store.accept_proposals(w.decision(0)).is_err());
    assert!(
        w.world
            .store
            .add_unit_comment(w.comment(0, "의견"))
            .is_err()
    );
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        "외부 수정\n"
    );
    assert!(
        w.world
            .database()
            .query_row("SELECT COUNT(*) FROM unit_comments", [], |r| r
                .get::<_, u32>(0))
            .unwrap()
            == 0
    );
}
