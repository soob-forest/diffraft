mod native_model_support;

use docreview_core::domain::{
    ai::ResponseMode, error::ErrorCode, generation::GenerationOutcome, model::ModelSelection,
};
use native_model_support::{World, checked, selected_cli};

fn verify_patch(model: ModelSelection) {
    let world = World::new(&selected_cli());
    let result = checked(world.execute(world.request(model, ResponseMode::Patch)));
    let GenerationOutcome::Patch(batch) = result else {
        panic!("expected structured PATCH");
    };
    assert_eq!(batch.proposals.len(), 1);
    assert!(batch.proposals[0].operation.after.contains("reviewed"));
    assert_eq!(
        checked(world.store.task_conversation(&world.task, None))
            .messages
            .len(),
        2
    );
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 CLI 기본 모델 PATCH. 명시 실행 전용."]
fn cli_default_returns_structured_patch() {
    verify_patch(ModelSelection::CliDefault);
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 Sonnet PATCH. 명시 실행 전용."]
fn sonnet_returns_structured_patch() {
    verify_patch(ModelSelection::Sonnet);
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 Opus PATCH. 명시 실행 전용."]
fn opus_returns_structured_patch() {
    verify_patch(ModelSelection::Opus);
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 Haiku PATCH. 명시 실행 전용."]
fn haiku_returns_structured_patch() {
    verify_patch(ModelSelection::Haiku);
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 Sonnet→Opus 재개. 명시 실행 전용."]
fn model_switch_after_restart_preserves_session_candidate_and_conversation() {
    let world = World::new(&selected_cli());
    let GenerationOutcome::Patch(batch) =
        checked(world.execute(world.request(ModelSelection::Sonnet, ResponseMode::Patch)))
    else {
        panic!("expected structured PATCH");
    };
    assert!(!batch.proposals.is_empty());
    let before = checked(world.store.active_session(&world.task)).expect("session required");
    let messages = checked(world.store.task_conversation(&world.task, None)).messages;
    let world = world.restart();
    let mut request = world.request(ModelSelection::Opus, ResponseMode::Explain);
    request.expected_active_batch_id = Some(batch.id.clone());
    let outcome = world.execute(request);
    let message_count = world.verify_history(&batch, &messages);
    assert!(matches!(checked(outcome), GenerationOutcome::Explain(_)));
    assert_eq!(message_count, messages.len() + 2);
    let after = checked(world.store.active_session(&world.task)).expect("session required");
    assert_eq!(before.session_id, after.session_id);
    assert_eq!(before.cwd, after.cwd);
}

#[test]
fn unavailable_cli_preserves_source_and_model_without_creating_a_session() {
    let directory = tempfile::tempdir().unwrap();
    let world = World::new(&directory.path().join("missing-official-claude"));
    let result = world.execute(world.request(ModelSelection::Haiku, ResponseMode::Patch));
    let error = match result {
        Err(error) => error,
        Ok(_) => panic!("missing CLI must fail before execution"),
    };
    assert_eq!(error.code, ErrorCode::CliUnsupported);
    assert!(checked(world.store.active_session(&world.task)).is_none());
    assert!(
        checked(world.store.task_conversation(&world.task, None))
            .messages
            .is_empty()
    );
}
