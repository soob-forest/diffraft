use crate::{codex_process::fixture, model_selection::request, support::World, world::add_task};
use docreview_core::{
    claude_adapter::{coordinator::Coordinator, generation},
    domain::{
        ai_settings::AiSettingsAction,
        error::ErrorCode,
        model::ModelSelection,
        provider::{AiProvider, ProviderModel, ReasoningEffort},
    },
    storage::Store,
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

#[test]
fn cancellation_interrupts_the_owned_turn_and_blocks_duplicates_until_cleanup() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut input = request(&world, &task, ModelSelection::CliDefault);
    input.model = ProviderModel::Codex {
        model: "fixture-codex".into(),
        effort: ReasoningEffort::Low,
    };
    let job = input.operation_id.clone();
    let launcher = fixture(&world, "HANG");
    let coordinator = Arc::new(Coordinator::new(world.store.directory()));
    let guard = coordinator.begin(&job).unwrap();
    std::thread::scope(|scope| {
        let worker = scope.spawn(|| {
            let result =
                generation::execute(&world.store, &launcher, input, guard.cancelled.clone());
            drop(guard);
            result
        });
        wait_for(&world.directory.path().join("codex-generation-ready"));
        assert_eq!(
            coordinator
                .begin(&uuid::Uuid::new_v4().to_string())
                .err()
                .unwrap()
                .code,
            ErrorCode::Busy
        );
        world
            .store
            .update_ai_preferences(AiSettingsAction::Provider {
                provider: AiProvider::Claude,
            })
            .unwrap();
        coordinator.cancel(&world.store, &job).unwrap();
        assert_eq!(
            worker.join().unwrap().unwrap_err().code,
            ErrorCode::Cancelled
        );
    });
    assert_clean_cancelled_state(world, &task, &coordinator);
}

fn assert_clean_cancelled_state(world: World, task: &str, coordinator: &Coordinator) {
    assert!(world.directory.path().join("codex-interrupted").is_file());
    assert!(!world.store.directory().join("cli-process.json").exists());
    assert!(coordinator.snapshot().unwrap().operation_id.is_none());
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        world.document.content
    );
    let data = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&data).unwrap();
    let page = store.task_conversation(task, None).unwrap();
    assert_eq!(page.last_attempt.unwrap().status, "CANCELLED");
    assert_eq!(page.messages.len(), 1);
    assert!(store.task_review(task).unwrap().batches.is_empty());
}

fn wait_for(path: &std::path::Path) {
    let deadline = Instant::now() + Duration::from_secs(4);
    while !path.exists() {
        assert!(Instant::now() < deadline, "fixture readiness timeout");
        std::thread::sleep(Duration::from_millis(5));
    }
}
