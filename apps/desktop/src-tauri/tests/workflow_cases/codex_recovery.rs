use crate::{
    codex_process::fixture,
    model_selection::{flag, request},
    support::World,
    world::add_task,
};
use docreview_core::{
    claude_adapter::generation,
    domain::{
        ai::{AiResponse, ResponseMode},
        conversation::{SavedGenerationRequest, TaskSessionState},
        error::ErrorCode,
        model::ModelSelection,
        provider::{ProviderModel, ReasoningEffort},
        review::ReviewJob,
    },
    storage::{Store, codex_execution::CodexExecution, runtime::Runtime},
};

fn model() -> ProviderModel {
    ProviderModel::Codex {
        model: "fixture-codex".into(),
        effort: ReasoningEffort::Low,
    }
}

fn begin(world: &World, task: &str) -> ReviewJob {
    let mut input = request(world, task, ModelSelection::CliDefault);
    input.model = model();
    world.store.begin_generation(input).unwrap()
}

fn execution(world: &World, scope: char, session: Option<&str>) -> CodexExecution {
    CodexExecution {
        model: model(),
        mode: ResponseMode::Explain,
        requested_session: session.map(String::from),
        cwd: world
            .directory
            .path()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned(),
        cli_version: "0.165.0".into(),
        retry_of: None,
        account_scope: scope.to_string().repeat(64),
    }
}

fn seed(world: &World, task: &str, scope: char, thread: &str) -> ReviewJob {
    let job = begin(world, task);
    world
        .store
        .record_codex_execution(&job, &execution(world, scope, None))
        .unwrap();
    world
        .store
        .complete_explanation(
            &job,
            &AiResponse::Explain {
                schema_version: 1,
                answer: "복구 전 로컬 대화".into(),
            },
            thread,
        )
        .unwrap();
    job
}

#[test]
fn missing_codex_session_changes_only_matching_account_task_and_provider() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let other = add_task(&world, &world.document.id);
    let thread = "10000000-0000-4000-8000-000000000001";
    seed(&world, &task, 'a', thread);
    seed(&world, &task, 'b', thread);
    seed(&world, &other, 'a', "other-thread");
    world
        .database()
        .execute(
            "INSERT INTO session_bindings VALUES(?1,?2,?3,?4,'fixture','ACTIVE',0)",
            rusqlite::params![world.runtime.id(), task, thread, "/private/fixture"],
        )
        .unwrap();
    let failed = begin(&world, &task);
    world
        .store
        .record_codex_execution(&failed, &execution(&world, 'a', Some(thread)))
        .unwrap();
    world
        .store
        .finish_failed_job(&failed, ErrorCode::SessionMissing)
        .unwrap();
    assert!(
        world
            .store
            .codex_session(&task, &"a".repeat(64))
            .unwrap()
            .is_none()
    );
    assert!(
        world
            .store
            .codex_session(&task, &"b".repeat(64))
            .unwrap()
            .is_some()
    );
    assert!(
        world
            .store
            .codex_session(&other, &"a".repeat(64))
            .unwrap()
            .is_some()
    );
    assert!(world.store.active_session(&task).unwrap().is_some());
}

#[test]
fn late_failure_cannot_retire_a_replacement_or_a_successful_binding() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let first = seed(&world, &task, 'a', "first-thread");
    let missing = begin(&world, &task);
    world
        .store
        .record_codex_execution(&missing, &execution(&world, 'a', Some("first-thread")))
        .unwrap();
    world
        .store
        .finish_failed_job(&missing, ErrorCode::SessionMissing)
        .unwrap();
    let replacement = seed(&world, &task, 'a', "replacement-thread");
    for job in [&first, &missing, &replacement] {
        world
            .store
            .finish_failed_job(job, ErrorCode::SessionMissing)
            .unwrap();
    }
    assert_eq!(
        world
            .store
            .codex_session(&task, &"a".repeat(64))
            .unwrap()
            .unwrap()
            .session_id,
        "replacement-thread"
    );
}

#[test]
fn missing_thread_preserves_history_and_restarts_only_on_manual_retry_after_reopen() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut input = request(&world, &task, ModelSelection::CliDefault);
    input.model = model();
    generation::execute(
        &world.store,
        &fixture(&world, "SUCCESS"),
        input.clone(),
        flag(),
    )
    .unwrap();
    input.operation_id = world.runtime.id();
    let error = generation::execute(
        &world.store,
        &fixture(&world, "SESSION_MISSING"),
        input,
        flag(),
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::SessionMissing);
    let page = world.store.task_conversation(&task, None).unwrap();
    assert!(matches!(page.session, TaskSessionState::Missing));
    assert_eq!(page.messages.len(), 3);
    let launcher = fixture(&world, "RECOVERY_SUCCESS");
    let data = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&data).unwrap();
    let attempt = store
        .task_conversation(&task, None)
        .unwrap()
        .last_attempt
        .unwrap();
    let SavedGenerationRequest::Generate(mut retry) = attempt.request else {
        panic!("generate")
    };
    retry.operation_id = uuid::Uuid::new_v4().to_string();
    retry.retry_of = Some(attempt.job_id);
    generation::execute(&store, &launcher, *retry, flag()).unwrap();
    let page = store.task_conversation(&task, None).unwrap();
    assert_eq!(page.last_attempt.unwrap().status, "SUCCEEDED");
    assert_eq!(page.messages.len(), 5);
    assert!(matches!(page.session, TaskSessionState::Connected));
    assert_eq!(
        store.snapshot(&world.document.id).unwrap().content,
        world.document.content
    );
}

#[test]
fn unrelated_resume_error_keeps_the_existing_thread_for_the_next_request() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut input = request(&world, &task, ModelSelection::CliDefault);
    input.model = model();
    generation::execute(
        &world.store,
        &fixture(&world, "SUCCESS"),
        input.clone(),
        flag(),
    )
    .unwrap();
    let before = std::fs::read(world.directory.path().join("codex-observation.json")).unwrap();
    input.operation_id = world.runtime.id();
    let error = generation::execute(
        &world.store,
        &fixture(&world, "RESUME_DENIED"),
        input.clone(),
        flag(),
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::CliUnsupported);
    assert!(!error.message.contains("SECRET_FIXTURE"));
    assert!(matches!(
        world.store.task_conversation(&task, None).unwrap().session,
        TaskSessionState::Connected
    ));
    input.operation_id = world.runtime.id();
    generation::execute(&world.store, &fixture(&world, "SUCCESS"), input, flag()).unwrap();
    let after = std::fs::read(world.directory.path().join("codex-observation.json")).unwrap();
    let before: serde_json::Value = serde_json::from_slice(&before).unwrap();
    let after: serde_json::Value = serde_json::from_slice(&after).unwrap();
    assert_eq!(before["thread"], after["thread"]);
}

#[test]
fn failed_missing_session_write_rolls_back_job_failure_and_can_be_retried() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    seed(&world, &task, 'a', "existing-thread");
    let job = begin(&world, &task);
    world
        .store
        .record_codex_execution(&job, &execution(&world, 'a', Some("existing-thread")))
        .unwrap();
    world.database().execute_batch("CREATE TRIGGER reject_missing BEFORE UPDATE ON codex_sessions BEGIN SELECT RAISE(ABORT,'INJECTED'); END;").unwrap();
    assert!(
        world
            .store
            .finish_failed_job(&job, ErrorCode::SessionMissing)
            .is_err()
    );
    let page = world.store.task_conversation(&task, None).unwrap();
    assert_eq!(page.last_attempt.unwrap().status, "RUNNING");
    assert!(matches!(page.session, TaskSessionState::Connected));
    world
        .database()
        .execute_batch("DROP TRIGGER reject_missing")
        .unwrap();
    world
        .store
        .finish_failed_job(&job, ErrorCode::SessionMissing)
        .unwrap();
    assert!(matches!(
        world.store.task_conversation(&task, None).unwrap().session,
        TaskSessionState::Missing
    ));
}
