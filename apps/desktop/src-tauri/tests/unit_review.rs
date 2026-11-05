#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::{
    domain::{review::Decision, rewrite::BatchDecisionRequest, unit_review::ReviewMode},
    storage::runtime::Runtime,
};
use fixture::UnitWorld;

#[test]
fn starting_preserves_source_and_registers_one_stable_plan() {
    let w = UnitWorld::source();
    let request = w.start_request();
    let batch = w.world.store.start_rewrite_review(request.clone()).unwrap();
    assert_eq!(batch.mode, "REWRITE");
    assert_eq!(batch.review_mode, ReviewMode::Changes);
    assert_eq!(batch.review_units.len(), 2);
    let plan = batch.review_plan.unwrap();
    let again = w.world.store.start_rewrite_review(request.clone()).unwrap();
    assert_eq!(again.review_plan.unwrap().id, plan.id);
    assert_eq!(again.review_units[1].number, 2);
    let other = w.start();
    assert_eq!(other.review_units[0].id, batch.review_units[0].id);
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT count(*) FROM review_plans", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
    replay_after_accept(&w, request, &plan.id);
}

#[test]
fn partial_decisions_reconstruct_current_head_and_exclude_rejected_text() {
    let w = UnitWorld::source();
    w.start();
    let request = w.decision(0);
    let head = w.world.store.accept_proposals(request.clone()).unwrap();
    assert_eq!(head.content, "첫 수정\n\n둘 문단\n");
    assert_eq!(
        w.world.store.accept_proposals(request).unwrap().version,
        head.version
    );
    w.world.store.reject_proposals(w.decision(1)).unwrap();
    let projection = w
        .world
        .store
        .review_projection(&w.batch.id, &head.version_id)
        .unwrap();
    assert_eq!(projection.before, head.content);
    assert_eq!(projection.after, head.content);
    assert!(projection.groups.is_empty());
    assert_eq!(
        w.current().candidate_markdown.as_deref(),
        Some("첫 수정\n\n둘 수정\n")
    );
}

#[test]
fn whole_apply_cannot_bypass_rejected_unit_before_any_accept() {
    let w = UnitWorld::source();
    w.start();
    w.world.store.reject_proposals(w.decision(0)).unwrap();
    let request = BatchDecisionRequest {
        document_id: w.head.id.clone(),
        batch_id: w.batch.id.clone(),
        expected_head_id: w.head.version_id.clone(),
        operation_id: w.world.runtime.id(),
    };
    assert!(w.world.store.apply_rewrite(request.clone()).is_err());
    assert!(w.world.store.select_rewrite(request).is_err());
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().content,
        w.head.content
    );
}

#[test]
fn reopening_preserves_rejection_and_comments_without_duplicate_active_revisions() {
    let w = UnitWorld::source();
    let initial = w.start();
    let comment = w
        .world
        .store
        .add_unit_comment(w.comment(0, "기존 수치를 유지해 주세요."))
        .unwrap();
    w.world.store.reject_proposals(w.decision(0)).unwrap();
    let request = w.reopen(0);
    let batch = w.world.store.reopen_unit_review(request.clone()).unwrap();
    assert_eq!(batch.review_units[0].id, initial.review_units[0].id);
    assert_eq!(batch.review_units[0].review_revision, 2);
    assert_eq!(batch.proposals.len(), 2);
    let original = w
        .world
        .store
        .proposal_revision(&batch.id, &batch.review_units[0].proposals[0].id, 1)
        .unwrap();
    assert_eq!(original.decision, Decision::Rejected);
    w.world.store.reopen_unit_review(request).unwrap();
    assert_eq!(w.current().review_units[0].review_revision, 2);
    assert_eq!(
        w.world.store.task_review(&w.task).unwrap().unit_comments[0].id,
        comment.id
    );
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
    w.world.store.accept_proposals(w.decision(0)).unwrap();
    assert!(w.world.store.reopen_unit_review(w.reopen(0)).is_err());
    assert_eq!(
        w.world
            .store
            .accept_proposals(w.decision(1))
            .unwrap()
            .content,
        "첫 수정\n\n둘 수정\n"
    );
}

#[test]
fn unchanged_candidate_has_zero_units_and_no_implicit_document_version() {
    let w = UnitWorld::new("같은 문서\n", "같은 문서\n");
    let batch = w.start();
    assert!(batch.review_units.is_empty());
    assert!(batch.proposals.is_empty());
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
}

fn replay_after_accept(
    w: &UnitWorld,
    request: docreview_core::domain::unit_review::StartRewriteReview,
    expected: &str,
) {
    w.world.store.accept_proposals(w.decision(0)).unwrap();
    assert_eq!(
        w.world
            .store
            .start_rewrite_review(request)
            .unwrap()
            .review_plan
            .unwrap()
            .id,
        expected
    );
}
