use crate::world::{ReviewWorld, add_task};
use docreview_core::{
    domain::{
        annotations::{AddComment, ReviewSide, RevisionRequest},
        review::ReviewBatch,
    },
    storage::runtime::Runtime,
};

pub fn comment_request(world: &ReviewWorld, side: ReviewSide) -> AddComment {
    let proposal = &world.batch.proposals[2];
    let text = if side == ReviewSide::Before {
        &proposal.operation.before
    } else {
        &proposal.operation.after
    };
    AddComment {
        id: world.world.runtime.id(),
        batch_id: world.batch.id.clone(),
        proposal_id: proposal.id.clone(),
        expected_revision: proposal.revision,
        side,
        from_utf16: 0,
        to_utf16: text.encode_utf16().count() as u32,
        text: "실행 주체를 명확하게 해 주세요.".into(),
    }
}

pub fn revision_request(world: &ReviewWorld, after: &str) -> RevisionRequest {
    let proposal = &world.batch.proposals[2];
    RevisionRequest {
        document_id: world.head.id.clone(),
        batch_id: world.batch.id.clone(),
        proposal_id: proposal.id.clone(),
        expected_revision: proposal.revision,
        expected_head_id: world.head.version_id.clone(),
        operation_id: world.world.runtime.id(),
        after: after.into(),
    }
}

pub fn d03(batch: &ReviewBatch) -> &docreview_core::domain::review::Proposal {
    batch
        .proposals
        .iter()
        .find(|p| p.operation.block_id == "b12")
        .unwrap()
}

#[test]
fn before_and_after_anchors_never_cross_sides_on_revision() {
    let world = ReviewWorld::new();
    let before = world
        .world
        .store
        .add_comment(comment_request(&world, ReviewSide::Before))
        .unwrap();
    let after = world
        .world
        .store
        .add_comment(comment_request(&world, ReviewSide::After))
        .unwrap();
    world
        .world
        .store
        .save_proposal_revision(revision_request(&world, "다른 여행 기록를 기록합니다."))
        .unwrap();
    let comments = world.world.store.review_comments(&world.task).unwrap();
    let before_new = comments.iter().find(|c| c.id == before.id).unwrap();
    assert_eq!(before_new.anchor.side, ReviewSide::Before);
    assert_eq!(before_new.anchor.quote, before.anchor.quote);
    assert_eq!(before_new.anchor.range, before.anchor.range);
    assert_eq!(before_new.status, "OPEN");
    let after_new = comments.iter().find(|c| c.id == after.id).unwrap();
    assert_eq!(after_new.anchor.side, ReviewSide::After);
    assert_eq!(after_new.anchor.proposal_revision, 1);
    assert_eq!(after_new.anchor.display_revision, 2);
    assert!(after_new.anchor.display_range.is_none());
    assert_eq!(after_new.status, "NEEDS_VERIFICATION");
}

#[test]
fn exact_quote_relinks_but_preserves_original_anchor_and_user_resolution() {
    let world = ReviewWorld::new();
    let mut request = comment_request(&world, ReviewSide::After);
    request.to_utf16 = 5;
    let comment = world.world.store.add_comment(request.clone()).unwrap();
    assert_eq!(comment.anchor.quote, "준비 확인");
    world
        .world
        .store
        .set_comment_status(&comment.id, 1, true)
        .unwrap();
    assert!(
        world
            .world
            .store
            .set_comment_status(&comment.id, 1, false)
            .is_err()
    );
    world
        .world
        .store
        .save_proposal_revision(revision_request(
            &world,
            "실제 준비 확인이 있으면 조치합니다.",
        ))
        .unwrap();
    let saved = world
        .world
        .store
        .review_comments(&world.task)
        .unwrap()
        .remove(0);
    assert_eq!(saved.status, "RESOLVED");
    assert_eq!(saved.anchor.proposal_revision, 1);
    assert_eq!(
        saved.anchor.display_range.unwrap().from,
        "실제 ".len() as u32
    );
    assert_eq!(
        world
            .world
            .store
            .add_comment(request.clone())
            .unwrap()
            .revision,
        saved.revision
    );
}

#[test]
fn comment_replay_is_idempotent_and_tasks_are_isolated() {
    let world = ReviewWorld::new();
    let mut request = comment_request(&world, ReviewSide::After);
    let first = world.world.store.add_comment(request.clone()).unwrap();
    assert_eq!(
        world.world.store.add_comment(request.clone()).unwrap().id,
        first.id
    );
    request.text = "같은 ID로 바꾸기".into();
    assert!(world.world.store.add_comment(request).is_err());
    let other = add_task(&world.world, &world.head.id);
    assert!(
        world
            .world
            .store
            .review_comments(&other)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn ambiguous_quote_and_invalid_comment_inputs_remain_safe() {
    let world = ReviewWorld::new();
    let mut request = comment_request(&world, ReviewSide::After);
    request.to_utf16 = 5;
    world.world.store.add_comment(request.clone()).unwrap();
    world
        .world
        .store
        .save_proposal_revision(revision_request(
            &world,
            "준비 확인과 준비 확인을 기록합니다.",
        ))
        .unwrap();
    assert_eq!(
        world.world.store.review_comments(&world.task).unwrap()[0].status,
        "NEEDS_VERIFICATION"
    );
    for text in [String::new(), "x".repeat(16 * 1024 + 1), "\0".into()] {
        request.id = world.world.runtime.id();
        request.text = text;
        assert!(world.world.store.add_comment(request.clone()).is_err());
    }
    assert_eq!(
        world
            .world
            .store
            .review_comments(&world.task)
            .unwrap()
            .len(),
        1
    );
}
