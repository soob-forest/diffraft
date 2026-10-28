use crate::{
    rewrite_world::{CONFIRMED, REWRITE, RewriteWorld, response},
    support::World,
};
use docreview_core::{
    domain::{editor::ScopeSelection, error::ErrorCode, history::RestoreRequest, review::Decision},
    storage::{models::SaveReason, review_jobs::BeginReviewJob, runtime::Runtime},
};
use std::fs;

#[test]
fn whole_candidate_has_real_four_line_diff_and_apply_then_restore_produces_v16() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    assert_w02_diff(&world);
    let request = world.request();
    let applied = store.apply_rewrite(request.clone()).unwrap();
    assert_eq!((applied.version, applied.content.as_str()), (15, REWRITE));
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), REWRITE);
    assert_eq!(store.version_content(&applied.id, 14).unwrap(), CONFIRMED);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "APPLIED"
    );
    assert_eq!(store.apply_rewrite(request.clone()).unwrap().version, 15);
    let restored = store
        .restore_version(RestoreRequest {
            document_id: applied.id,
            expected_head_id: applied.version_id,
            target_version_id: world.head.version_id.clone(),
            operation_id: world.world.runtime.id(),
        })
        .unwrap();
    assert_eq!(
        (restored.version, restored.content.as_str()),
        (16, CONFIRMED)
    );
    assert_eq!(store.version_content(&restored.id, 15).unwrap(), REWRITE);
    let mut changed = request;
    changed.batch_id = world.world.runtime.id();
    assert_eq!(
        store.apply_rewrite(changed).unwrap_err().code,
        ErrorCode::InvalidInput
    );
}

fn assert_w02_diff(world: &RewriteWorld) {
    let store = &world.world.store;
    let projection = store
        .review_projection(&world.batch.id, &world.head.version_id)
        .unwrap();
    assert_eq!(projection.before, CONFIRMED);
    assert_eq!(projection.after, REWRITE);
    assert_eq!(
        (projection.stats.added_lines, projection.stats.removed_lines),
        (4, 4)
    );
    assert!(projection.groups.is_empty());
    assert!(projection.batch.proposals.is_empty());
}

#[test]
fn selecting_previous_candidate_and_discarding_never_changes_confirmed_content() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let job = world.begin();
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    let next = store
        .register_rewrite(&job, &response("# 다른 방향\r\n"))
        .unwrap();
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ARCHIVED"
    );
    assert!(store.register_rewrite(&job, &response("중복")).is_err());
    let select = world.request();
    store.select_rewrite(select.clone()).unwrap();
    store.select_rewrite(select.clone()).unwrap();
    assert_eq!(store.review_batch(&next.id).unwrap().status, "ARCHIVED");
    assert_eq!(
        store.discard_batch(select).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_discarded_history(&world);
}

fn assert_discarded_history(world: &RewriteWorld) {
    let store = &world.world.store;
    let discard = world.request();
    let discarded = store.discard_batch(discard.clone()).unwrap();
    assert_eq!(discarded.status, "DISCARDED");
    assert_eq!(discarded.candidate_markdown.as_deref(), Some(REWRITE));
    store.discard_batch(discard).unwrap();
    assert!(store.select_rewrite(world.request()).is_err());
    assert!(store.apply_rewrite(world.request()).is_err());
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), CONFIRMED);
    assert_eq!(store.snapshot(&world.head.id).unwrap().version, 14);
    assert_eq!(store.task_review(&world.task).unwrap().batches.len(), 2);
}

#[test]
fn rewrite_requires_whole_scope_valid_content_and_the_active_attempt() {
    let world = World::new();
    let task = crate::world::add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: world.document.id.clone(),
            task_id: task,
            expected_version: 1,
            selection: ScopeSelection::Selection { from: 1, to: 5 },
        })
        .unwrap();
    assert_eq!(
        world
            .store
            .register_rewrite(&job, &response(REWRITE))
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    assert!(world.store.register_rewrite(&job, &response("\0")).is_err());
    assert!(
        world
            .store
            .register_rewrite(&job, &crate::world::response())
            .is_err()
    );
    world
        .store
        .finish_failed_job(&job, ErrorCode::Cancelled)
        .unwrap();
    assert!(
        world
            .store
            .register_rewrite(&job, &response(REWRITE))
            .is_err()
    );
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 1);
}

#[test]
fn generic_save_cannot_bypass_whole_candidate_approval() {
    let world = World::new();
    let mut bypass = world.request();
    bypass.reason = SaveReason::Rewrite;
    assert_eq!(
        world.store.save(bypass).unwrap_err().code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn stale_candidate_remains_readable_but_cannot_be_selected_or_applied() {
    let world = RewriteWorld::new();
    let job = world.begin();
    let mut edit = world.world.request();
    edit.expected_version = 14;
    edit.content = "# 생성 중 직접 수정\n".into();
    let head = world.world.store.save(edit).unwrap();
    let late = world
        .world
        .store
        .register_rewrite(&job, &response("# 늦은 후보\n"))
        .unwrap();
    let projection = world
        .world
        .store
        .review_projection(&late.id, &head.version_id)
        .unwrap();
    assert_eq!(projection.before, head.content);
    assert_eq!(projection.after, "# 늦은 후보\n");
    let mut request = world.request();
    request.expected_head_id = head.version_id;
    request.batch_id = late.id;
    assert_eq!(
        world
            .world
            .store
            .apply_rewrite(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::StaleBase
    );
    assert_eq!(
        world.world.store.select_rewrite(request).unwrap_err().code,
        ErrorCode::StaleBase
    );
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), head.content);
}

#[test]
fn failed_or_cancelled_generation_preserves_previous_candidate() {
    let world = RewriteWorld::new();
    let job = world.begin();
    world
        .world
        .store
        .finish_failed_job(&job, ErrorCode::Cancelled)
        .unwrap();
    assert_eq!(
        world
            .world
            .store
            .register_rewrite(&job, &response("# 늦은 응답"))
            .unwrap_err()
            .code,
        ErrorCode::Cancelled
    );
    assert_eq!(
        world
            .world
            .store
            .review_batch(&world.batch.id)
            .unwrap()
            .status,
        "ACTIVE"
    );
    let job = world.begin();
    world
        .world
        .store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=ON"))
        .unwrap();
    assert_eq!(
        world
            .world
            .store
            .register_rewrite(&job, &response("# 새 후보"))
            .unwrap_err()
            .code,
        ErrorCode::SaveFailed
    );
    assert_eq!(
        world
            .world
            .store
            .review_batch(&world.batch.id)
            .unwrap()
            .status,
        "ACTIVE"
    );
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), CONFIRMED);
}

#[test]
fn cancelling_a_patch_batch_keeps_accepted_text_and_decisions() {
    let world = crate::world::ReviewWorld::new();
    let accepted = world
        .world
        .store
        .accept_proposals(world.request(&[0]))
        .unwrap();
    let request = docreview_core::domain::rewrite::BatchDecisionRequest {
        document_id: accepted.id.clone(),
        batch_id: world.batch.id.clone(),
        expected_head_id: accepted.version_id,
        operation_id: world.world.runtime.id(),
    };
    let discarded = world.world.store.discard_batch(request).unwrap();
    assert_eq!(discarded.status, "DISCARDED");
    assert_eq!(discarded.proposals[0].decision, Decision::Accepted);
    assert!(
        discarded.proposals[1..]
            .iter()
            .all(|p| p.decision == Decision::Discarded)
    );
    assert_eq!(
        fs::read_to_string(&world.world.path).unwrap(),
        accepted.content
    );
    assert_eq!(
        world.world.store.snapshot(&accepted.id).unwrap().version,
        13
    );
}
