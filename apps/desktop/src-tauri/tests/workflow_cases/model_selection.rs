use crate::{support::World, world::add_task};
use docreview_core::{
    claude_adapter::{execution::CliLauncher, generation, model_settings, process::ProcessSpec},
    domain::{
        ai::ResponseMode, conversation::SavedGenerationRequest, editor::ScopeSelection,
        error::ErrorCode, generation::GenerateRequest, model::ModelSelection,
    },
    storage::{Store, runtime::Runtime},
};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

pub(super) fn request(world: &World, task: &str, model: ModelSelection) -> GenerateRequest {
    GenerateRequest {
        model,
        document_id: world.document.id.clone(),
        task_id: task.into(),
        expected_head_id: world.document.version_id.clone(),
        operation_id: world.runtime.id(),
        mode: ResponseMode::Explain,
        selection: ScopeSelection::Whole,
        instruction: "합성 설명".into(),
        expected_active_batch_id: None,
        archive_previous: false,
        retry_of: None,
    }
}

pub(super) fn launcher(world: &World, mode: &str) -> CliLauncher {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    CliLauncher::Fixture(ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-claude.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: world.directory.path().to_owned(),
        environment: Default::default(),
        timeout: Duration::from_secs(5),
    })
}

pub(super) fn flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

#[test]
fn selected_model_reaches_the_real_child_and_execution_record_for_every_choice() {
    for model in [
        ModelSelection::CliDefault,
        ModelSelection::Sonnet,
        ModelSelection::Opus,
        ModelSelection::Haiku,
    ] {
        let world = World::new();
        let task = add_task(&world, &world.document.id);
        let request = request(&world, &task, model);
        let job_id = request.operation_id.clone();
        let expected = model.alias().unwrap_or("cli_default");
        fs::write(world.directory.path().join("expected-model"), expected).unwrap();
        generation::execute(&world.store, &launcher(&world, "EXPLAIN"), request, flag()).unwrap();
        let observed: serde_json::Value = serde_json::from_slice(
            &fs::read(world.directory.path().join("model-observation.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(observed["model"], expected);
        let recorded: String = world
            .database()
            .query_row(
                "SELECT requested_model FROM job_executions WHERE job_id=?1",
                [&job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(recorded, expected);
        assert_eq!(
            fs::read_to_string(&world.path).unwrap(),
            world.document.content
        );
    }
}

#[test]
fn prepare_pins_saved_request_even_after_default_changes_and_cancellation_keeps_source() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_generation(request(&world, &task, ModelSelection::Sonnet))
        .unwrap();
    model_settings::save(world.store.directory(), ModelSelection::Opus).unwrap();
    let prepared = launcher(&world, "EXPLAIN")
        .prepare(&world.store, &job, ResponseMode::Explain, None)
        .unwrap();
    assert_eq!(
        prepared.context.requested_model,
        Some(ModelSelection::Sonnet)
    );
    assert_eq!(prepared.spec.args.last().unwrap(), "sonnet");
    world.store.cancel_generation(&job.id).unwrap();
    assert!(
        world
            .store
            .record_execution(&job, &prepared.context)
            .is_err()
    );
    assert_eq!(
        fs::read_to_string(&world.path).unwrap(),
        world.document.content
    );
}

#[test]
fn setup_failure_preserves_model_after_restart_and_manual_retry_ignores_new_default() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let original = request(&world, &task, ModelSelection::Opus);
    let CliLauncher::Fixture(mut missing) = launcher(&world, "EXPLAIN") else {
        unreachable!()
    };
    missing.program = world.directory.path().join("not-installed");
    assert!(
        generation::execute(
            &world.store,
            &CliLauncher::Fixture(missing),
            original,
            flag()
        )
        .is_err()
    );
    let fixture = launcher(&world, "EXPLAIN");
    let data = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&data).unwrap();
    model_settings::save(&data, ModelSelection::Haiku).unwrap();
    let failed = store
        .task_conversation(&task, None)
        .unwrap()
        .last_attempt
        .unwrap();
    let SavedGenerationRequest::Generate(mut retry) = failed.request else {
        panic!("generate")
    };
    assert_eq!(retry.model, ModelSelection::Opus);
    retry.operation_id = uuid::Uuid::new_v4().to_string();
    retry.retry_of = Some(failed.job_id);
    generation::execute(&store, &fixture, *retry, flag()).unwrap();
    assert_eq!(
        store
            .task_conversation(&task, None)
            .unwrap()
            .last_attempt
            .unwrap()
            .status,
        "SUCCEEDED"
    );
}

#[test]
fn changed_retry_model_is_rejected_before_spawning_a_child() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let first = world
        .store
        .begin_generation(request(&world, &task, ModelSelection::Sonnet))
        .unwrap();
    world
        .store
        .finish_failed_job(&first, ErrorCode::NetworkError)
        .unwrap();
    let mut retry = request(&world, &task, ModelSelection::Opus);
    retry.retry_of = Some(first.id);
    fs::write(world.directory.path().join("expected-model"), "opus").unwrap();
    let error =
        generation::execute(&world.store, &launcher(&world, "EXPLAIN"), retry, flag()).unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidInput);
    assert!(
        !world
            .directory
            .path()
            .join("model-observation.json")
            .exists()
    );
}

#[test]
fn model_policy_failure_does_not_retry_or_mutate_document() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let error = generation::execute(
        &world.store,
        &launcher(&world, "MODEL_DENIED"),
        request(&world, &task, ModelSelection::Haiku),
        flag(),
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::RateOrPolicy);
    assert_eq!(
        world
            .database()
            .query_row("SELECT COUNT(*) FROM jobs", [], |row| row.get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        fs::read_to_string(&world.path).unwrap(),
        world.document.content
    );
}

#[test]
fn v6_upgrade_preserves_history_and_marks_old_execution_model_unknown() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    generation::execute(
        &world.store,
        &launcher(&world, "EXPLAIN"),
        request(&world, &task, ModelSelection::Sonnet),
        flag(),
    )
    .unwrap();
    world.database().execute_batch("ALTER TABLE job_executions DROP COLUMN requested_model; UPDATE generation_jobs SET request_json=json_remove(request_json,'$.model'); PRAGMA user_version=6;").unwrap();
    let data = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&data).unwrap();
    let page = store.task_conversation(&task, None).unwrap();
    assert_eq!(page.messages.len(), 2);
    let SavedGenerationRequest::Generate(request) = page.last_attempt.unwrap().request else {
        panic!("generate")
    };
    assert_eq!(request.model, ModelSelection::CliDefault);
    store
        .configure_database_for_test(|db| {
            assert_eq!(
                db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0))?,
                7
            );
            assert_eq!(
                db.query_row("SELECT requested_model FROM job_executions", [], |row| {
                    row.get::<_, Option<String>>(0)
                })?,
                None
            );
            Ok(())
        })
        .unwrap();
    assert!(fs::read_dir(data).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-6.")
    }));
}

#[test]
fn legacy_requests_default_but_unknown_models_fail_deserialization() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut json = serde_json::to_value(request(&world, &task, ModelSelection::Sonnet)).unwrap();
    json.as_object_mut().unwrap().remove("model");
    assert_eq!(
        serde_json::from_value::<GenerateRequest>(json.clone())
            .unwrap()
            .model,
        ModelSelection::CliDefault
    );
    json["model"] = "arbitrary".into();
    assert!(serde_json::from_value::<GenerateRequest>(json).is_err());
}
