use crate::{model_selection::request, support::World, world::add_task};
use docreview_core::{
    domain::{
        ai::{AiResponse, ResponseMode},
        error::ErrorCode,
        model::ModelSelection,
        provider::{ProviderModel, ReasoningEffort},
    },
    storage::codex_execution::CodexExecution,
};

fn model() -> ProviderModel {
    ProviderModel::Codex {
        model: "fixture".into(),
        effort: ReasoningEffort::Low,
    }
}
fn execution(scope: char) -> CodexExecution {
    CodexExecution {
        model: model(),
        mode: ResponseMode::Explain,
        requested_session: None,
        cwd: "/private/fixture".into(),
        cli_version: "0.165.0".into(),
        retry_of: None,
        account_scope: scope.to_string().repeat(64),
    }
}

#[test]
fn codex_model_and_opaque_session_are_persisted_without_binding_claude_or_other_accounts() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut input = request(&world, &task, ModelSelection::CliDefault);
    input.model = model();
    let job = world.store.begin_generation(input.clone()).unwrap();
    world
        .store
        .record_codex_execution(&job, &execution('a'))
        .unwrap();
    let answer = AiResponse::Explain {
        schema_version: 1,
        answer: "합성 설명".into(),
    };
    world
        .store
        .complete_explanation(&job, &answer, "thread_opaque.1")
        .unwrap();
    assert_eq!(
        world
            .store
            .codex_session(&task, &"a".repeat(64))
            .unwrap()
            .unwrap()
            .session_id,
        "thread_opaque.1"
    );
    assert!(
        world
            .store
            .codex_session(&task, &"b".repeat(64))
            .unwrap()
            .is_none()
    );
    assert!(world.store.active_session(&task).unwrap().is_none());
    let replay = world.store.begin_generation(input.clone()).unwrap();
    assert_eq!(replay.attempt_id, job.attempt_id);
    input.model = ModelSelection::Sonnet.into();
    assert!(world.store.begin_generation(input).is_err());
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        world.document.content
    );
}

#[test]
fn codex_retry_cannot_switch_provider() {
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
    let mut retry = request(&world, &task, ModelSelection::CliDefault);
    retry.model = model();
    retry.retry_of = Some(first.id.clone());
    let job = world.store.begin_generation(retry).unwrap();
    let mut context = execution('a');
    context.retry_of = Some(first.id);
    assert!(world.store.record_codex_execution(&job, &context).is_err());
    assert!(
        world
            .store
            .codex_session(&task, &"a".repeat(64))
            .unwrap()
            .is_none()
    );
}

#[test]
fn codex_execution_check_rejects_incomplete_model_objects() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut input = request(&world, &task, ModelSelection::CliDefault);
    input.model = model();
    let job = world.store.begin_generation(input).unwrap();
    world
        .store
        .record_codex_execution(&job, &execution('a'))
        .unwrap();
    for value in [
        r#"{"provider":"codex"}"#,
        r#"{"model":"fixture","effort":"low"}"#,
        r#"{"provider":"codex","model":null,"effort":"low"}"#,
    ] {
        assert!(
            world
                .database()
                .execute(
                    "UPDATE job_executions SET requested_model=?1 WHERE job_id=?2",
                    rusqlite::params![value, job.id]
                )
                .is_err(),
            "incomplete model must fail the DB constraint"
        );
    }
}

#[test]
fn resumed_result_from_a_different_thread_rolls_back_without_success_messages() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut input = request(&world, &task, ModelSelection::CliDefault);
    input.model = model();
    let job = world.store.begin_generation(input.clone()).unwrap();
    world
        .store
        .record_codex_execution(&job, &execution('a'))
        .unwrap();
    let response = AiResponse::Explain {
        schema_version: 1,
        answer: "合成".into(),
    };
    world
        .store
        .complete_explanation(&job, &response, "opaque_thread")
        .unwrap();
    input.operation_id = uuid::Uuid::new_v4().to_string();
    let next = world.store.begin_generation(input).unwrap();
    let mut resumed = execution('a');
    resumed.requested_session = Some("opaque_thread".into());
    world.store.record_codex_execution(&next, &resumed).unwrap();
    assert!(
        world
            .store
            .complete_explanation(&next, &response, "other_thread")
            .is_err()
    );
    assert_eq!(
        world
            .store
            .task_conversation(&task, None)
            .unwrap()
            .messages
            .len(),
        3
    );
    assert_eq!(
        world
            .store
            .codex_session(&task, &"a".repeat(64))
            .unwrap()
            .unwrap()
            .session_id,
        "opaque_thread"
    );
}

#[test]
fn request_contract_reads_legacy_strings_and_rejects_mixed_provider_shapes() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut json = serde_json::to_value(request(&world, &task, ModelSelection::Sonnet)).unwrap();
    json["model"] = serde_json::json!("sonnet");
    let parsed: docreview_core::domain::generation::GenerateRequest =
        serde_json::from_value(json.clone()).unwrap();
    assert_eq!(
        parsed.model,
        ProviderModel::Claude {
            model: ModelSelection::Sonnet
        }
    );
    json["model"] = serde_json::json!({"provider":"claude","model":"fixture","effort":"low"});
    assert!(
        serde_json::from_value::<docreview_core::domain::generation::GenerateRequest>(json)
            .is_err()
    );
}
