use crate::{
    comments::{comment_request, d03, revision_request},
    world::{BASE, ReviewWorld},
};
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse},
        annotations::ReviewSide,
        error::ErrorCode,
        regeneration::RegenerateRequest,
        review::Decision,
    },
    storage::{Store, runtime::Runtime},
};

const REVISED: &str = "여행자는 준비물과 다음 여행 계획을 여행 기록에 남깁니다.";

pub(super) fn request(world: &ReviewWorld) -> RegenerateRequest {
    RegenerateRequest {
        model: Default::default(),
        document_id: world.head.id.clone(),
        batch_id: world.batch.id.clone(),
        proposal_id: d03(&world.batch).id.clone(),
        expected_revision: 1,
        expected_head_id: world.head.version_id.clone(),
        operation_id: world.world.runtime.id(),
        retry_of: None,
        instruction: "코멘트를 반영해 실행 주체를 명확하게 해 주세요.".into(),
    }
}
fn response(world: &ReviewWorld) -> AiResponse {
    let old = &d03(&world.batch).operation;
    AiResponse::Patch {
        schema_version: 1,
        summary: "실행 주체 명시".into(),
        changes: vec![AiChange {
            block_id: old.block_id.clone(),
            before: old.before.clone(),
            after: REVISED.into(),
            reason: "코멘트의 실행 주체 반영".into(),
        }],
    }
}

#[test]
fn regeneration_pins_context_and_locks_candidate_mutation() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    store
        .add_comment(comment_request(&world, ReviewSide::After))
        .unwrap();
    let request = request(&world);
    let job = store.begin_regeneration(request.clone()).unwrap();
    let context: serde_json::Value =
        serde_json::from_str(&store.regeneration_context(&job).unwrap()).unwrap();
    assert_eq!(context["scope"]["text"], d03(&world.batch).operation.before);
    assert_eq!(context["target"]["revision"], 1);
    assert_eq!(context["comments"][0]["anchor"]["side"], "after");
    assert!(store.task_review(&world.task).unwrap().generating);
    assert_eq!(
        store
            .begin_regeneration(request.clone())
            .unwrap()
            .attempt_id,
        job.attempt_id
    );
    assert_eq!(
        store
            .save_proposal_revision(revision_request(&world, REVISED))
            .unwrap_err()
            .code,
        ErrorCode::Busy
    );
    assert_eq!(
        d03(&store.review_batch(&world.batch.id).unwrap()).revision,
        1
    );
}

#[test]
fn successful_regeneration_replaces_once_and_preserves_original_revision() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    store
        .add_comment(comment_request(&world, ReviewSide::After))
        .unwrap();
    let request = request(&world);
    let job = store.begin_regeneration(request.clone()).unwrap();
    let batch = store
        .register_regeneration(&job, &response(&world))
        .unwrap();
    assert_eq!(d03(&batch).revision, 2);
    assert_eq!(d03(&batch).operation.after, REVISED);
    assert_eq!(d03(&batch).decision, Decision::Pending);
    assert_eq!(batch.proposals[0].revision, 1);
    assert_eq!(
        store
            .proposal_revision(&batch.id, &request.proposal_id, 1)
            .unwrap()
            .decision,
        Decision::Superseded
    );
    assert_eq!(
        store.review_comments(&world.task).unwrap()[0].status,
        "NEEDS_VERIFICATION"
    );
    assert!(!store.task_review(&world.task).unwrap().generating);
    assert!(
        store
            .register_regeneration(&job, &response(&world))
            .is_err()
    );
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
}

#[test]
fn malformed_or_wrong_target_result_and_database_failure_leave_r1_and_comments() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    store
        .add_comment(comment_request(&world, ReviewSide::Before))
        .unwrap();
    let job = store.begin_regeneration(request(&world)).unwrap();
    let mut invalid = response(&world);
    if let AiResponse::Patch { changes, .. } = &mut invalid {
        changes[0].block_id = "b4".into();
    }
    assert_eq!(
        store
            .register_regeneration(&job, &invalid)
            .unwrap_err()
            .code,
        ErrorCode::OutputInvalid
    );
    assert!(store.register_patch(&job, &response(&world)).is_err());
    store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=ON"))
        .unwrap();
    assert_eq!(
        store
            .register_regeneration(&job, &response(&world))
            .unwrap_err()
            .code,
        ErrorCode::SaveFailed
    );
    store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=OFF"))
        .unwrap();
    store
        .finish_failed_job(&job, ErrorCode::OutputInvalid)
        .unwrap();
    assert_eq!(
        d03(&store.review_batch(&world.batch.id).unwrap()).revision,
        1
    );
    let comment = store.review_comments(&world.task).unwrap().remove(0);
    assert_eq!(comment.status, "OPEN");
    assert_eq!(comment.revision, 1);
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
}

#[test]
fn cancelled_attempt_cannot_replace_candidate_after_new_attempt_starts() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let old = store.begin_regeneration(request(&world)).unwrap();
    store.finish_failed_job(&old, ErrorCode::Cancelled).unwrap();
    let new = store.begin_regeneration(request(&world)).unwrap();
    assert_eq!(
        store
            .register_regeneration(&old, &response(&world))
            .unwrap_err()
            .code,
        ErrorCode::Cancelled
    );
    assert_eq!(
        d03(&store
            .register_regeneration(&new, &response(&world))
            .unwrap())
        .revision,
        2
    );
    store.finish_failed_job(&new, ErrorCode::Cancelled).unwrap();
    assert!(store.completed_regeneration(&new).unwrap().is_some());
}

#[test]
fn editing_during_regeneration_rejects_late_result_and_preserves_current_head() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let job = store.begin_regeneration(request(&world)).unwrap();
    let mut edit = world.world.request();
    edit.expected_version = 12;
    edit.content = format!("{BASE}\n직접 수정\n");
    store.save(edit.clone()).unwrap();
    assert_eq!(
        store
            .register_regeneration(&job, &response(&world))
            .unwrap_err()
            .code,
        ErrorCode::StaleBase
    );
    store.finish_failed_job(&job, ErrorCode::StaleBase).unwrap();
    assert_eq!(
        d03(&store.review_batch(&world.batch.id).unwrap()).revision,
        1
    );
    assert_eq!(
        std::fs::read_to_string(&world.world.path).unwrap(),
        edit.content
    );
}

#[test]
fn restart_releases_abandoned_job_and_keeps_previous_candidate_and_comments() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    store
        .add_comment(comment_request(&world, ReviewSide::After))
        .unwrap();
    let request = request(&world);
    let job = store.begin_regeneration(request.clone()).unwrap();
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    assert!(!store.task_review(&world.task).unwrap().generating);
    assert_eq!(
        d03(&store.review_batch(&world.batch.id).unwrap()).revision,
        1
    );
    assert_eq!(store.review_comments(&world.task).unwrap()[0].revision, 1);
    assert_eq!(
        store.begin_regeneration(request).unwrap_err().code,
        ErrorCode::Cancelled
    );
    assert!(store.regeneration_context(&job).is_err());
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
}

#[test]
fn oversized_context_and_invalid_instruction_never_create_a_running_job() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let mut invalid = request(&world);
    invalid.instruction = "\0".into();
    assert!(store.begin_regeneration(invalid).is_err());
    for _ in 0..14 {
        let mut comment = comment_request(&world, ReviewSide::After);
        comment.text = "x".repeat(16 * 1024);
        store.add_comment(comment).unwrap();
    }
    assert_eq!(
        store.begin_regeneration(request(&world)).unwrap_err().code,
        ErrorCode::ContextTooLarge
    );
    assert!(!store.task_review(&world.task).unwrap().generating);
    assert_eq!(
        d03(&store.review_batch(&world.batch.id).unwrap()).revision,
        1
    );
}
