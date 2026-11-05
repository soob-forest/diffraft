#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::{domain::rewrite::BatchDecisionRequest, storage::runtime::Runtime};
use fixture::UnitWorld;
use std::{sync::Barrier, thread};

#[test]
fn concurrent_reopens_create_exactly_one_new_round() {
    let w = UnitWorld::source();
    w.start();
    w.world.store.reject_proposals(w.decision(0)).unwrap();
    let mut second = w.reopen(0);
    second.operation_id = w.world.runtime.id();
    let requests = [w.reopen(0), second];
    let barrier = Barrier::new(2);
    let outcomes = thread::scope(|scope| {
        requests
            .into_iter()
            .map(|request| {
                let store = &w.world.store;
                let barrier = &barrier;
                scope.spawn(move || {
                    barrier.wait();
                    store.reopen_unit_review(request).is_ok()
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_eq!(outcomes.iter().filter(|ok| **ok).count(), 1);
    assert_eq!(w.current().review_units[0].review_revision, 2);
    assert_eq!(w.current().proposals.len(), 2);
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT COUNT(*) FROM proposals WHERE revision=2", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
}

#[test]
fn comment_and_cancel_serialize_without_moving_or_losing_registered_opinions() {
    let w = UnitWorld::source();
    w.start();
    let comment = w.comment(0, "검토 의견");
    let id = comment.id.clone();
    let cancel = BatchDecisionRequest {
        document_id: w.head.id.clone(),
        batch_id: w.batch.id.clone(),
        expected_head_id: w.head.version_id.clone(),
        operation_id: w.world.runtime.id(),
    };
    let barrier = Barrier::new(2);
    let (saved, cancelled) = thread::scope(|scope| {
        let store = &w.world.store;
        let barrier = &barrier;
        let writer = scope.spawn(move || {
            barrier.wait();
            store.add_unit_comment(comment).is_ok()
        });
        let discard = scope.spawn(move || {
            barrier.wait();
            store.discard_batch(cancel).is_ok()
        });
        (writer.join().unwrap(), discard.join().unwrap())
    });
    assert!(cancelled);
    let comments = w.world.store.task_review(&w.task).unwrap().unit_comments;
    assert_eq!(comments.len(), usize::from(saved));
    if saved {
        assert_eq!(comments[0].id, id);
        assert_eq!(comments[0].unit_id, w.current().review_units[0].id);
    }
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT COUNT(*) FROM review_plans", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
}
