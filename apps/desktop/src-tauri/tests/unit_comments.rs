#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::storage::runtime::Runtime;
use fixture::UnitWorld;

#[test]
fn whole_unit_comments_are_independent_of_decisions_and_idempotent() {
    let w = UnitWorld::source();
    w.start();
    let request = w.comment(0, "수치를 유지해 주세요.");
    let first = w.world.store.add_unit_comment(request.clone()).unwrap();
    assert_eq!(
        w.world.store.add_unit_comment(request.clone()).unwrap().id,
        first.id
    );
    w.world
        .store
        .add_unit_comment(w.comment(0, "추가 의견"))
        .unwrap();
    w.world
        .store
        .add_unit_comment(w.comment(1, "다른 단위 의견"))
        .unwrap();
    let state = w.world.store.task_review(&w.task).unwrap();
    assert_eq!(state.unit_comments.len(), 3);
    assert!(state.comments.is_empty());
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT count(*) FROM unit_comments", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        3
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version
    );
    assert!(
        w.current()
            .proposals
            .iter()
            .all(|p| p.decision == docreview_core::domain::review::Decision::Pending)
    );
    assert_status_cas(&w, &first.id);
    let mut changed = request;
    changed.text = "다른 내용".into();
    assert!(w.world.store.add_unit_comment(changed).is_err());
}

#[test]
fn deletion_unit_accepts_comments_without_a_quote_or_candidate_text() {
    let w = UnitWorld::new("삭제할 문단\n", "");
    w.start();
    let comment = w
        .world
        .store
        .add_unit_comment(w.comment(0, "삭제하면 안 됩니다."))
        .unwrap();
    assert_eq!(comment.unit_id, w.current().review_units[0].id);
    w.world.store.accept_proposals(w.decision(0)).unwrap();
    assert_eq!(
        w.world.store.task_review(&w.task).unwrap().unit_comments[0].status,
        "OPEN"
    );
    w.world
        .store
        .add_unit_comment(w.comment(0, "승인 후 의견"))
        .unwrap();
}

#[test]
fn invalid_text_targets_and_status_cas_do_not_mutate_comments() {
    let w = UnitWorld::source();
    w.start();
    for text in [
        "".into(),
        "  \n".into(),
        "잘못\0된 의견".into(),
        "한".repeat(6000),
    ] {
        assert!(w.world.store.add_unit_comment(w.comment(0, &text)).is_err());
    }
    let mut request = w.comment(0, "의견");
    request.plan_id = w.world.runtime.id();
    assert!(w.world.store.add_unit_comment(request).is_err());
    let mut request = w.comment(0, "의견");
    request.unit_id = w.world.runtime.id();
    assert!(w.world.store.add_unit_comment(request).is_err());
    assert!(
        w.world
            .store
            .task_review(&w.task)
            .unwrap()
            .unit_comments
            .is_empty()
    );
}

fn assert_status_cas(w: &UnitWorld, id: &str) {
    let resolved = w.world.store.set_unit_comment_status(id, 1, true).unwrap();
    assert_eq!(resolved.status, "RESOLVED");
    assert!(w.world.store.set_unit_comment_status(id, 1, false).is_err());
    assert_eq!(
        w.world
            .store
            .set_unit_comment_status(id, 2, false)
            .unwrap()
            .status,
        "OPEN"
    );
}
