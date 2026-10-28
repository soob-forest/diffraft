use crate::world::{BASE, CANDIDATE, ReviewWorld, add_task, register, response};
use docreview_core::domain::{
    error::ErrorCode,
    review::{Decision, Validity},
};
use std::{fs, sync::Barrier, thread};

#[test]
fn b01_projection_has_three_exact_changes_and_grapheme_highlights() {
    let world = ReviewWorld::new();
    let projection = world
        .world
        .store
        .review_projection(&world.batch.id, &world.head.version_id)
        .unwrap();
    assert_eq!(projection.before, BASE);
    assert_eq!(projection.after, CANDIDATE);
    assert_eq!(
        (
            projection.stats.added_lines,
            projection.stats.removed_lines,
            projection.stats.pending_groups
        ),
        (3, 3, 3)
    );
    let changed: Vec<_> = projection
        .hunks
        .iter()
        .flat_map(|h| &h.lines)
        .filter(|l| l.kind == "delete")
        .map(|l| l.old_line.unwrap())
        .collect();
    assert_eq!(changed, [4, 8, 12]);
    let line = projection
        .hunks
        .iter()
        .flat_map(|h| &h.lines)
        .find(|l| l.kind == "delete" && l.old_line == Some(8))
        .unwrap();
    assert_eq!(
        line.segments
            .iter()
            .filter(|s| s.changed)
            .map(|s| s.text.as_str())
            .collect::<String>(),
        "10"
    );
    assert!(projection.hunks.iter().any(|h| h.group_ids.len() > 1));
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), BASE);
}

#[test]
fn partial_accept_recalculates_without_reapplying_and_duplicate_is_once() {
    let mut world = ReviewWorld::new();
    let request = world.request(&[0]);
    let head = world.world.store.accept_proposals(request.clone()).unwrap();
    assert_eq!(head.version, 13);
    assert_eq!(
        world
            .world
            .store
            .accept_proposals(request.clone())
            .unwrap()
            .version,
        13
    );
    assert_eq!(
        head.content,
        BASE.replace(
            &world.batch.proposals[0].operation.before,
            &world.batch.proposals[0].operation.after
        )
    );
    let projection = world
        .world
        .store
        .review_projection(&world.batch.id, &head.version_id)
        .unwrap();
    assert_eq!(projection.after, CANDIDATE);
    assert_eq!(projection.stats.added_lines, 2);
    assert_eq!(projection.batch.proposals[1].validity, Validity::Valid);
    world.head = head;
    assert_eq!(
        world
            .world
            .store
            .accept_proposals(world.request(&[1, 2]))
            .unwrap()
            .content,
        CANDIDATE
    );
}

#[test]
fn duplicate_operation_cannot_change_its_proposal_set() {
    let world = ReviewWorld::new();
    let mut request = world.request(&[0]);
    world.world.store.accept_proposals(request.clone()).unwrap();
    request.proposals = world.request(&[1]).proposals;
    assert_eq!(
        world
            .world
            .store
            .accept_proposals(request)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn rejected_d02_is_excluded_from_one_version_bulk_accept() {
    let world = ReviewWorld::new();
    let rejected = world.request(&[1]);
    world
        .world
        .store
        .reject_proposals(rejected.clone())
        .unwrap();
    world.world.store.reject_proposals(rejected).unwrap();
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), BASE);
    let projection = world
        .world
        .store
        .review_projection(&world.batch.id, &world.head.version_id)
        .unwrap();
    assert_eq!(projection.groups.len(), 2);
    assert_eq!(projection.batch.proposals[1].decision, Decision::Rejected);
    let head = world
        .world
        .store
        .accept_proposals(world.request(&[0, 2]))
        .unwrap();
    assert_eq!(head.version, 13);
    assert!(head.content.contains("10분"));
    assert!(!head.content.contains("5분"));
    let events: u32 = world
        .world
        .database()
        .query_row(
            "SELECT COUNT(*) FROM decision_events WHERE kind='reject'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(events, 1);
}

#[test]
fn external_write_after_bulk_confirmation_applies_nothing() {
    let world = ReviewWorld::new();
    let request = world.request(&[0, 1, 2]);
    fs::write(&world.world.path, "외부 파일").unwrap();
    assert_eq!(
        world
            .world
            .store
            .accept_proposals(request)
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().version,
        12
    );
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), "외부 파일");
    let batch = world.world.store.review_batch(&world.batch.id).unwrap();
    assert!(
        batch
            .proposals
            .iter()
            .all(|p| p.decision == Decision::Pending && p.validity == Validity::Stale)
    );
}

#[test]
fn manual_edit_invalidates_confirmation_and_other_task_accept_stales_batch() {
    let world = ReviewWorld::new();
    let other = add_task(&world.world, &world.head.id);
    let batch = register(&world.world, &world.head, &other, &response());
    world
        .world
        .store
        .accept_proposals(world.request(&[0]))
        .unwrap();
    assert!(
        world
            .world
            .store
            .review_batch(&batch.id)
            .unwrap()
            .proposals
            .iter()
            .all(|p| p.validity == Validity::Stale)
    );
    let request = world.request(&[1, 2]);
    let mut edit = world.world.request();
    edit.expected_version = 13;
    edit.content = "직접 수정".into();
    let head = world.world.store.save(edit).unwrap();
    assert_eq!(
        world
            .world
            .store
            .accept_proposals(request)
            .unwrap_err()
            .code,
        ErrorCode::StaleBase
    );
    assert_eq!(head.version, 14);
    assert!(
        world
            .world
            .store
            .review_batch(&world.batch.id)
            .unwrap()
            .proposals
            .iter()
            .filter(|p| p.decision == Decision::Pending)
            .all(|p| p.validity == Validity::Stale)
    );
}

#[test]
fn two_accepts_compete_on_expected_head_without_partial_writes() {
    let world = ReviewWorld::new();
    let barrier = Barrier::new(2);
    let results = thread::scope(|scope| {
        let handles: Vec<_> = [world.request(&[0]), world.request(&[1])]
            .into_iter()
            .map(|request| {
                scope.spawn(|| {
                    barrier.wait();
                    world.world.store.accept_proposals(request)
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().version,
        13
    );
    let batch = world.world.store.review_batch(&world.batch.id).unwrap();
    assert_eq!(
        batch
            .proposals
            .iter()
            .filter(|p| p.decision == Decision::Accepted)
            .count(),
        1
    );
}
