use crate::{
    rewrite_jobs::request,
    rewrite_world::{RewriteWorld, response},
};
use docreview_core::{domain::ai::ResponseMode, storage::generation_models::ExecutionContext};

const SESSION: &str = "10000000-0000-4000-8000-000000000001";
const ORIGINAL_VERSION: &str = "2.1.311";
const UPDATED_VERSION: &str = "2.1.312";

fn context(version: &str, resume: bool) -> ExecutionContext {
    ExecutionContext {
        requested_model: Some(Default::default()),
        mode: ResponseMode::Rewrite,
        requested_session_id: resume.then(|| SESSION.into()),
        cwd: "/private/test/task".into(),
        cli_version: version.into(),
        retry_of: None,
    }
}

fn bound_world() -> RewriteWorld {
    let mut world = RewriteWorld::new();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    store
        .record_execution(&job, &context(ORIGINAL_VERSION, false))
        .unwrap();
    world.batch = store
        .complete_rewrite(&job, &response("# 첫 후보"), SESSION)
        .unwrap();
    world
}

#[test]
fn cli_update_resumes_existing_session_and_records_each_actual_version() {
    let world = bound_world();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    let mut wrong = context(UPDATED_VERSION, true);
    wrong.cwd = "/private/another-task".into();
    assert!(store.record_execution(&job, &wrong).is_err());
    wrong = context(UPDATED_VERSION, true);
    wrong.requested_session_id = Some("10000000-0000-4000-8000-000000000002".into());
    assert!(store.record_execution(&job, &wrong).is_err());
    store
        .record_execution(&job, &context(UPDATED_VERSION, true))
        .unwrap();
    store
        .complete_rewrite(&job, &response("# 재개한 후보"), SESSION)
        .unwrap();
    let binding = store.active_session(&world.task).unwrap().unwrap();
    assert_eq!(binding.session_id, SESSION);
    assert_eq!(binding.cli_version, UPDATED_VERSION);
    let versions: u32 = world
        .world
        .database()
        .query_row(
            "SELECT COUNT(DISTINCT cli_version) FROM job_executions",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(versions, 2);
    assert_eq!(
        store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
}

#[test]
fn failed_completion_keeps_last_successful_version_until_atomic_retry() {
    let world = bound_world();
    let store = &world.world.store;
    let job = store.begin_rewrite(request(&world)).unwrap();
    store
        .record_execution(&job, &context(UPDATED_VERSION, true))
        .unwrap();
    let db = world.world.database();
    db.execute_batch("CREATE TRIGGER reject_upgrade_assistant BEFORE INSERT ON messages WHEN NEW.role='ASSISTANT' BEGIN SELECT RAISE(ABORT,'INJECTED'); END;").unwrap();
    assert!(
        store
            .complete_rewrite(&job, &response("# 실패 후보"), SESSION)
            .is_err()
    );
    assert_eq!(
        store
            .active_session(&world.task)
            .unwrap()
            .unwrap()
            .cli_version,
        ORIGINAL_VERSION
    );
    db.execute_batch("DROP TRIGGER reject_upgrade_assistant")
        .unwrap();
    store
        .complete_rewrite(&job, &response("# 복구 후보"), SESSION)
        .unwrap();
    assert_eq!(
        store
            .active_session(&world.task)
            .unwrap()
            .unwrap()
            .cli_version,
        UPDATED_VERSION
    );
}
