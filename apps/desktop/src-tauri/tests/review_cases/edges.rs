use crate::world::{BASE, ReviewWorld, register, response};
use docreview_core::{
    domain::{
        ai::AiResponse,
        editor::ScopeSelection,
        error::ErrorCode,
        review::{ProposalRevision, Validity},
    },
    storage::review_jobs::BeginReviewJob,
};

#[test]
fn dependency_group_cannot_be_partially_accepted_or_rejected() {
    let mut world = ReviewWorld::new();
    let mut response = response();
    if let AiResponse::Patch { changes, .. } = &mut response {
        changes[0].after.push_str("\n추가 문맥");
    }
    world.batch = register(&world.world, &world.head, &world.task, &response);
    assert!(
        world
            .batch
            .proposals
            .iter()
            .all(|p| p.group_id == world.batch.proposals[0].group_id)
    );
    assert!(
        world
            .world
            .store
            .accept_proposals(world.request(&[0]))
            .is_err()
    );
    assert!(
        world
            .world
            .store
            .reject_proposals(world.request(&[1]))
            .is_err()
    );
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
    let head = world
        .world
        .store
        .accept_proposals(world.request(&[0, 1, 2]))
        .unwrap();
    assert_eq!(head.version, 13);
}

#[test]
fn invalid_revision_duplicate_ids_and_generation_lock_cannot_write() {
    let world = ReviewWorld::new();
    let mut wrong = world.request(&[0]);
    wrong.proposals[0].revision = 2;
    assert!(world.world.store.accept_proposals(wrong).is_err());
    let mut duplicate = world.request(&[0]);
    duplicate.proposals.push(duplicate.proposals[0].clone());
    assert!(world.world.store.accept_proposals(duplicate).is_err());
    world
        .world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: world.head.id.clone(),
            task_id: world.task.clone(),
            expected_version: 12,
            selection: ScopeSelection::Whole,
        })
        .unwrap();
    assert_eq!(
        world
            .world
            .store
            .accept_proposals(world.request(&[0]))
            .unwrap_err()
            .code,
        ErrorCode::Busy
    );
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
}

#[test]
fn result_after_manual_edit_is_stale_and_registers_only_once() {
    let world = ReviewWorld::new();
    let job = world
        .world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: world.head.id.clone(),
            task_id: world.task.clone(),
            expected_version: 12,
            selection: ScopeSelection::Whole,
        })
        .unwrap();
    let mut edit = world.world.request();
    edit.expected_version = 12;
    edit.content = "생성 중 수정".into();
    let head = world.world.store.save(edit).unwrap();
    let batch = world.world.store.register_patch(&job, &response()).unwrap();
    assert!(
        batch
            .proposals
            .iter()
            .all(|p| p.validity == Validity::Stale)
    );
    assert_eq!(
        world
            .world
            .store
            .register_patch(&job, &response())
            .unwrap_err()
            .code,
        ErrorCode::Cancelled
    );
    let mut request = world.request(&[0]);
    request.expected_head_id = head.version_id;
    request.batch_id = batch.id;
    request.proposals = vec![ProposalRevision {
        id: batch.proposals[0].id.clone(),
        revision: 1,
    }];
    assert!(world.world.store.accept_proposals(request).is_err());
}

#[test]
fn generic_save_cannot_bypass_approval_validation() {
    let world = ReviewWorld::new();
    let mut request = world.world.request();
    request.expected_version = 12;
    request.reason = docreview_core::storage::models::SaveReason::Accept;
    assert!(world.world.store.save(request).is_err());
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
}
