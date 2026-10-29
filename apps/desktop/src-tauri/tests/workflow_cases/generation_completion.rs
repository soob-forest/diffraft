use crate::{
    rewrite_jobs::request,
    rewrite_world::{RewriteWorld, response},
    world::add_task,
};
use docreview_core::{
    domain::{ai::ResponseMode, error::ErrorCode},
    storage::{Store, generation_models::ExecutionContext, runtime::Runtime},
};

const SESSION: &str = "10000000-0000-4000-8000-000000000001";
const OTHER_SESSION: &str = "10000000-0000-4000-8000-000000000002";

fn execution() -> ExecutionContext {
    ExecutionContext {
        requested_model: Some(Default::default()),
        mode: ResponseMode::Rewrite,
        requested_session_id: None,
        cwd: "/private/test/task".into(),
        cli_version: "2.1.311".into(),
        retry_of: None,
    }
}

fn counts(world: &RewriteWorld) -> (u32, u32, u32) {
    world.world.database().query_row("SELECT (SELECT COUNT(*) FROM messages),(SELECT COUNT(*) FROM session_bindings),(SELECT COUNT(*) FROM proposal_batches)", [], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap()
}

#[test]
fn candidate_conversation_and_session_commit_once_and_survive_restart() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    store.record_execution(&job, &execution()).unwrap();
    assert_eq!(counts(&world), (1, 0, 1));
    assert!(store.record_execution(&job, &execution()).is_err());
    let result = store
        .complete_rewrite(&job, &response("# 새 후보"), SESSION)
        .unwrap();
    assert_eq!(counts(&world), (2, 1, 2));
    assert!(
        store
            .complete_rewrite(&job, &response("중복"), SESSION)
            .is_err()
    );
    assert_eq!(counts(&world), (2, 1, 2));
    assert_eq!(
        store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    assert_restored(&store, &world.task, &result.id);
}

fn assert_restored(store: &Store, task: &str, batch: &str) {
    assert_eq!(
        store.active_session(task).unwrap().unwrap().session_id,
        SESSION
    );
    assert_eq!(
        store
            .review_batch(batch)
            .unwrap()
            .candidate_markdown
            .as_deref(),
        Some("# 새 후보")
    );
    store
        .configure_database_for_test(|db| {
            let roles: String = db.query_row(
                "SELECT group_concat(role,',') FROM (SELECT role FROM messages ORDER BY seq)",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(roles, "USER,ASSISTANT");
            Ok(())
        })
        .unwrap();
}

#[test]
fn assistant_storage_failure_rolls_back_candidate_session_and_job_completion() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    store.record_execution(&job, &execution()).unwrap();
    world.world.database().execute_batch("CREATE TRIGGER reject_assistant BEFORE INSERT ON messages WHEN NEW.role='ASSISTANT' BEGIN SELECT RAISE(ABORT,'INJECTED'); END;").unwrap();
    assert!(
        store
            .complete_rewrite(&job, &response("# 새 후보"), SESSION)
            .is_err()
    );
    assert_eq!(counts(&world), (1, 0, 1));
    assert!(store.task_review(&world.task).unwrap().generating);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    world
        .world
        .database()
        .execute_batch("DROP TRIGGER reject_assistant")
        .unwrap();
    store
        .complete_rewrite(&job, &response("# 새 후보"), SESSION)
        .unwrap();
    assert_eq!(counts(&world), (2, 1, 2));
}

#[test]
fn resume_requires_exact_binding_and_rejects_session_switch_without_side_effects() {
    let mut world = RewriteWorld::new();
    let store = &world.world.store;
    let first = store.begin_rewrite(request(&world)).unwrap();
    store.record_execution(&first, &execution()).unwrap();
    world.batch = store
        .complete_rewrite(&first, &response("# 첫 후보"), SESSION)
        .unwrap();
    let next = store.begin_rewrite(request(&world)).unwrap();
    assert!(store.record_execution(&next, &execution()).is_err());
    let mut resume = execution();
    resume.requested_session_id = Some(SESSION.into());
    let mut wrong_cwd = resume.clone();
    wrong_cwd.cwd = "/private/other".into();
    assert!(store.record_execution(&next, &wrong_cwd).is_err());
    store.record_execution(&next, &resume).unwrap();
    assert_eq!(
        store
            .complete_rewrite(&next, &response("# 잘못된 연결"), OTHER_SESSION)
            .unwrap_err()
            .code,
        ErrorCode::OutputInvalid
    );
    assert_eq!(counts(&world), (3, 1, 2));
    store
        .complete_rewrite(&next, &response("# 재개한 후보"), SESSION)
        .unwrap();
    assert_eq!(counts(&world), (4, 1, 3));
}

#[test]
fn another_task_cannot_claim_existing_session_or_retry_foreign_job() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let first = store.begin_rewrite(request(&world)).unwrap();
    store.record_execution(&first, &execution()).unwrap();
    store
        .complete_rewrite(&first, &response("# 첫 후보"), SESSION)
        .unwrap();
    let other = add_task(&world.world, &world.head.id);
    let mut next = request(&world);
    next.task_id = other;
    next.expected_active_batch_id = None;
    next.reference_batch_id = None;
    let job = store.begin_rewrite(next).unwrap();
    let mut foreign = execution();
    foreign.retry_of = Some(first.id);
    assert!(store.record_execution(&job, &foreign).is_err());
    store.record_execution(&job, &execution()).unwrap();
    assert_eq!(
        store
            .complete_rewrite(&job, &response("# 다른 작업"), SESSION)
            .unwrap_err()
            .code,
        ErrorCode::OutputInvalid
    );
    assert_eq!(counts(&world), (3, 1, 2));
}

#[test]
fn cancelled_completion_keeps_user_instruction_and_cannot_create_session() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    store.record_execution(&job, &execution()).unwrap();
    store.cancel_generation(&job.id).unwrap();
    assert_eq!(
        store
            .complete_rewrite(&job, &response("# 늦은 결과"), SESSION)
            .unwrap_err()
            .code,
        ErrorCode::Cancelled
    );
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    assert_eq!(counts(&world), (1, 0, 1));
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
}

#[test]
fn missing_session_is_preserved_and_manual_retry_can_create_a_new_binding() {
    let mut world = RewriteWorld::new();
    let store = &world.world.store;
    let first = store.begin_rewrite(request(&world)).unwrap();
    store.record_execution(&first, &execution()).unwrap();
    world.batch = store
        .complete_rewrite(&first, &response("# 첫 후보"), SESSION)
        .unwrap();
    let missing = store.begin_rewrite(request(&world)).unwrap();
    let mut resume = execution();
    resume.requested_session_id = Some(SESSION.into());
    store.record_execution(&missing, &resume).unwrap();
    store
        .finish_failed_job(&missing, ErrorCode::SessionMissing)
        .unwrap();
    assert!(store.active_session(&world.task).unwrap().is_none());
    let retry = store.begin_rewrite(request(&world)).unwrap();
    let mut fresh = execution();
    fresh.retry_of = Some(missing.id);
    store.record_execution(&retry, &fresh).unwrap();
    store
        .complete_rewrite(&retry, &response("# 복구 후보"), OTHER_SESSION)
        .unwrap();
    assert_eq!(
        store
            .active_session(&world.task)
            .unwrap()
            .unwrap()
            .session_id,
        OTHER_SESSION
    );
    let status: String = world
        .world
        .database()
        .query_row(
            "SELECT status FROM session_bindings WHERE cli_session_id=?1",
            [SESSION],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "MISSING");
    assert_eq!(counts(&world), (5, 2, 3));
}

#[test]
fn execution_mode_and_legacy_registration_cannot_bypass_session_validation() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    let mut incorrect = execution();
    incorrect.mode = ResponseMode::Explain;
    store.record_execution(&job, &incorrect).unwrap();
    assert_eq!(
        store
            .complete_rewrite(&job, &response("# 잘못된 모드"), SESSION)
            .unwrap_err()
            .code,
        ErrorCode::OutputInvalid
    );
    assert!(store.register_rewrite(&job, &response("# 우회")).is_err());
    assert_eq!(counts(&world), (1, 0, 1));
    let mut invalid = execution();
    invalid.requested_session_id = Some(world.world.runtime.id());
    assert!(store.record_execution(&job, &invalid).is_err());
}
