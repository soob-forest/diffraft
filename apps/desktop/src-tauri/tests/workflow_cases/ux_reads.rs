use crate::{
    regeneration,
    world::{ReviewWorld, add_task, register, response},
};
use docreview_core::domain::ai::{AiChange, AiResponse};
use docreview_core::storage::runtime::Runtime;

#[test]
fn impact_includes_other_tasks_and_counts_groups_separately() {
    let world = ReviewWorld::new();
    let first = world.world.store.review_impact(&world.head.id).unwrap();
    assert_eq!(first.proposals, world.batch.proposals.len() as u32);
    let other = add_task(&world.world, &world.head.id);
    register(&world.world, &world.head, &other, &response());
    let both = world.world.store.review_impact(&world.head.id).unwrap();
    assert_eq!(both.proposals, first.proposals * 2);
    assert_eq!(both.groups, first.groups * 2);
    world
        .world
        .store
        .accept_proposals(world.request(&[0]))
        .unwrap();
    let remaining = world.world.store.review_impact(&world.head.id).unwrap();
    assert!(remaining.proposals < both.proposals);
}

#[test]
fn result_ref_stays_on_its_exact_revision_after_another_revision() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let request = regeneration::request(&world);
    let old = store
        .proposal_revision(&request.batch_id, &request.proposal_id, 1)
        .unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "다듬음".into(),
        changes: vec![AiChange {
            block_id: old.operation.block_id,
            before: old.operation.before,
            after: old.operation.after,
            reason: "검토".into(),
        }],
    };
    let job = store.begin_regeneration(request.clone()).unwrap();
    store.register_regeneration(&job, &response).unwrap();
    let result = store.generation_result_ref(&job.id).unwrap().unwrap();
    assert_eq!(result.revision, Some(2));
    assert_eq!(
        result.proposal_id.as_deref(),
        Some(request.proposal_id.as_str())
    );
    let mut next = request;
    next.expected_revision = 2;
    next.operation_id = world.world.runtime.id();
    let next_job = store.begin_regeneration(next).unwrap();
    store.register_regeneration(&next_job, &response).unwrap();
    let result = store.generation_result_ref(&job.id).unwrap().unwrap();
    assert_eq!(result.revision, Some(2));
    assert_eq!(result.status, "SUPERSEDED");
    assert!(
        store
            .generation_result_ref(&world.world.runtime.id())
            .unwrap()
            .is_none()
    );
}

#[test]
fn archived_batch_diff_uses_its_original_base_after_the_source_changes() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    register(&world.world, &world.head, &world.task, &response());
    let projection = store
        .review_projection(&world.batch.id, &world.head.version_id)
        .unwrap();
    assert_eq!(projection.before, world.head.content);
    assert!(
        projection
            .after
            .contains(&world.batch.proposals[0].operation.after)
    );
    assert!(projection.groups.is_empty());
}
