use crate::{
    rewrite_world::{CONFIRMED, REWRITE, RewriteWorld, response},
    world::ReviewWorld,
};
use docreview_core::{
    domain::{ai::AiResponse, error::ErrorCode, rewrite::RewriteRequest},
    storage::{Store, runtime::Runtime},
};

pub fn request(world: &RewriteWorld) -> RewriteRequest {
    RewriteRequest {
        document_id: world.head.id.clone(),
        task_id: world.task.clone(),
        expected_head_id: world.head.version_id.clone(),
        expected_active_batch_id: Some(world.batch.id.clone()),
        reference_batch_id: Some(world.batch.id.clone()),
        archive_patch: false,
        retry_of: None,
        instruction: "현재 후보와 다른 방향으로 실행 단계를 정리해 주세요.".into(),
        operation_id: world.world.runtime.id(),
    }
}

#[test]
fn another_direction_pins_original_base_selected_candidate_and_task_context() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let request = request(&world);
    let job = store.begin_rewrite(request.clone()).unwrap();
    let json = store.rewrite_context(&job).unwrap();
    let context: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(context["confirmed"]["content"], CONFIRMED);
    assert_eq!(context["reference"]["candidateMarkdown"], REWRITE);
    assert_eq!(context["reference"]["baseVersionId"], world.head.version_id);
    assert_eq!(context["reference"]["baseContent"], CONFIRMED);
    assert_eq!(context["pinnedRules"], "확인 시간 유지");
    world
        .world
        .database()
        .execute(
            "UPDATE tasks SET pinned_rules='나중에 바뀐 조건' WHERE id=?1",
            [&world.task],
        )
        .unwrap();
    assert_eq!(store.rewrite_context(&job).unwrap(), json);
    assert_eq!(
        store.begin_rewrite(request.clone()).unwrap().attempt_id,
        job.attempt_id
    );
    let mut changed = request;
    changed.instruction = "다른 지시".into();
    assert_eq!(
        store.begin_rewrite(changed).unwrap_err().code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn patch_archive_requires_explicit_confirmation_and_transaction_success() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let mut request = RewriteRequest {
        document_id: world.head.id.clone(),
        task_id: world.task.clone(),
        expected_head_id: world.head.version_id.clone(),
        expected_active_batch_id: Some(world.batch.id.clone()),
        reference_batch_id: None,
        archive_patch: false,
        retry_of: None,
        instruction: "문서 전체 재작성".into(),
        operation_id: world.world.runtime.id(),
    };
    assert_eq!(
        store.begin_rewrite(request.clone()).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    request.archive_patch = true;
    store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=ON"))
        .unwrap();
    assert_eq!(
        store.begin_rewrite(request.clone()).unwrap_err().code,
        ErrorCode::SaveFailed
    );
    store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=OFF"))
        .unwrap();
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    let job = store.begin_rewrite(request).unwrap();
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ARCHIVED"
    );
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    assert_eq!(store.snapshot(&world.head.id).unwrap().version, 12);
}

#[test]
fn rewrite_job_cannot_register_a_partial_response_through_patch_api() {
    let world = RewriteWorld::new();
    let job = world.world.store.begin_rewrite(request(&world)).unwrap();
    let patch = AiResponse::Patch {
        schema_version: 1,
        summary: "잘못된 모드".into(),
        changes: vec![],
    };
    assert_eq!(
        world
            .world
            .store
            .register_patch(&job, &patch)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
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
}

#[test]
fn duplicate_completion_returns_the_same_candidate_without_a_second_registration() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let request = request(&world);
    let job = store.begin_rewrite(request.clone()).unwrap();
    let batch = store
        .register_rewrite(&job, &response("# 또 다른 방향\n"))
        .unwrap();
    assert_eq!(store.completed_rewrite(&job).unwrap().unwrap().id, batch.id);
    assert_eq!(
        store.begin_rewrite(request).unwrap().attempt_id,
        job.attempt_id
    );
    assert!(store.register_rewrite(&job, &response("중복")).is_err());
    assert_eq!(store.task_review(&world.task).unwrap().batches.len(), 2);
    assert_eq!(store.snapshot(&world.head.id).unwrap().content, CONFIRMED);
}

#[test]
fn stale_reference_or_active_batch_and_invalid_instruction_create_no_job() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let mut invalid = request(&world);
    invalid.expected_active_batch_id = None;
    assert_eq!(
        store.begin_rewrite(invalid).unwrap_err().code,
        ErrorCode::StaleBase
    );
    let mut invalid = request(&world);
    invalid.instruction = "\0".into();
    assert_eq!(
        store.begin_rewrite(invalid).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    let mut invalid = request(&world);
    invalid.reference_batch_id = Some(world.world.runtime.id());
    assert!(store.begin_rewrite(invalid).is_err());
    assert!(!store.task_review(&world.task).unwrap().generating);
}

#[test]
fn restart_releases_abandoned_rewrite_and_preserves_original_candidate() {
    let world = RewriteWorld::new();
    let request = request(&world);
    let job = world.world.store.begin_rewrite(request.clone()).unwrap();
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    assert!(!store.task_review(&world.task).unwrap().generating);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    assert_eq!(
        store.begin_rewrite(request).unwrap_err().code,
        ErrorCode::Cancelled
    );
    assert!(store.register_rewrite(&job, &response(REWRITE)).is_err());
}
