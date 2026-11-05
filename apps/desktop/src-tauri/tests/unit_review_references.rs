#[path = "support/unit_review.rs"]
mod fixture;
#[path = "support/legacy_unit_references.rs"]
mod legacy_fixture;
mod support;
use docreview_core::{domain::review::Decision, storage::Store};
use legacy_fixture::{AFTER, BEFORE, decision, legacy, legacy_with, save_count, version};

#[test]
fn legacy_reference_partial_approval_is_rejected_before_any_save() {
    for (before, after) in [(BEFORE, AFTER), (AFTER, BEFORE)] {
        let w = legacy_with(before, after);
        let batch = w.current();
        assert_eq!(batch.review_units.len(), 3);
        let count = save_count(&w);
        assert!(w.world.store.accept_proposals(w.decision(1)).is_err());
        assert_eq!(save_count(&w), count);
        assert_eq!(
            w.world.store.snapshot(&w.head.id).unwrap().version,
            w.head.version
        );
        assert_eq!(std::fs::read_to_string(&w.world.path).unwrap(), before);
        assert!(
            w.current()
                .proposals
                .iter()
                .all(|p| p.decision == Decision::Pending)
        );
    }
}

#[test]
fn legacy_safe_units_and_complete_reference_component_preserve_identity_and_comments() {
    let w = legacy();
    let initial = w.current();
    let comment = w
        .world
        .store
        .add_unit_comment(w.comment(0, "기존 의견"))
        .unwrap();
    w.world.store.accept_proposals(w.decision(2)).unwrap();
    w.world
        .store
        .accept_proposals(decision(&w, &[0, 1]))
        .unwrap();
    assert_eq!(std::fs::read_to_string(&w.world.path).unwrap(), AFTER);
    let saved = w.current();
    assert_eq!(
        saved.review_plan.unwrap().id,
        initial.review_plan.unwrap().id
    );
    assert_eq!(
        saved
            .review_units
            .iter()
            .map(|u| (&u.id, u.number))
            .collect::<Vec<_>>(),
        initial
            .review_units
            .iter()
            .map(|u| (&u.id, u.number))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        w.world.store.task_review(&w.task).unwrap().unit_comments[0].id,
        comment.id
    );
    let original = w
        .world
        .store
        .original_rewrite_projection(&w.batch.id)
        .unwrap();
    assert_eq!(
        (original.before.as_str(), original.after.as_str()),
        (BEFORE, AFTER)
    );
}

#[test]
fn legacy_bulk_cannot_skip_rejected_dependency_but_reopen_restores_a_safe_path() {
    let w = legacy();
    let stale = w.decision(0);
    w.world.store.reject_proposals(stale.clone()).unwrap();
    let count = save_count(&w);
    assert!(
        w.world
            .store
            .accept_proposals(decision(&w, &[1, 2]))
            .is_err()
    );
    assert_eq!(save_count(&w), count);
    w.world.store.reopen_unit_review(w.reopen(0)).unwrap();
    assert!(w.world.store.accept_proposals(stale).is_err());
    w.world
        .store
        .accept_proposals(decision(&w, &[0, 1, 2]))
        .unwrap();
    assert_eq!(std::fs::read_to_string(&w.world.path).unwrap(), AFTER);
    assert_eq!(w.current().review_units[0].review_revision, 2);
}

#[test]
fn legacy_previously_accepted_dependency_allows_the_remaining_member() {
    let w = legacy();
    version(&w, 2);
    w.world.store.accept_proposals(w.decision(0)).unwrap();
    version(&w, 1);
    w.world.store.accept_proposals(w.decision(1)).unwrap();
    assert!(
        w.current()
            .proposals
            .iter()
            .filter(|p| p.decision == Decision::Accepted)
            .count()
            == 2
    );
}

#[test]
fn legacy_prepared_approval_recovers_without_rechecking_new_dependency_policy() {
    use docreview_core::{
        domain::error::{AppError, ErrorCode},
        storage::models::SaveStage,
    };
    use std::sync::Arc;
    let w = legacy();
    version(&w, 2);
    let request = w.decision(1);
    w.world
        .store
        .set_save_observer(Arc::new(|stage| {
            if stage == SaveStage::FileReplaced {
                Err(AppError::new(ErrorCode::SaveFailed, "합성 중단"))
            } else {
                Ok(())
            }
        }))
        .unwrap();
    assert!(w.world.store.accept_proposals(request.clone()).is_err());
    version(&w, 1);
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    let store = Store::open(&data).unwrap();
    let head = store.snapshot(&w.head.id).unwrap();
    assert_eq!(head.version, w.head.version + 1);
    assert_eq!(
        store.accept_proposals(request).unwrap().version,
        head.version
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        head.content
    );
}
