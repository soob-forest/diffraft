use crate::{
    model_selection::{flag, launcher, request},
    support::World,
    world::add_task,
};
use docreview_core::{
    claude_adapter::{execution::CliLauncher, generation},
    domain::{
        editor::ScopeSelection, error::ErrorCode, generation::GenerationOutcome,
        model::ModelSelection,
    },
    storage::Store,
};

fn legacy_json(world: &World) -> String {
    world
        .database()
        .execute(
            "UPDATE generation_jobs SET request_json=json_remove(request_json,'$.model')",
            [],
        )
        .unwrap();
    stored_json(world)
}

fn stored_json(world: &World) -> String {
    world
        .database()
        .query_row("SELECT request_json FROM generation_jobs", [], |row| {
            row.get(0)
        })
        .unwrap()
}

#[test]
fn legacy_running_request_reuses_attempt_without_rewriting_history() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let input = request(&world, &task, ModelSelection::CliDefault);
    let first = world.store.begin_generation(input.clone()).unwrap();
    let saved = legacy_json(&world);
    let replay = world.store.begin_generation(input).unwrap();
    assert_eq!(replay.id, first.id);
    assert_eq!(replay.attempt_id, first.attempt_id);
    assert_eq!(stored_json(&world), saved);
    let count: u32 = world
        .database()
        .query_row("SELECT COUNT(*) FROM jobs", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn legacy_completed_request_replays_after_upgrade_without_cli() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let input = request(&world, &task, ModelSelection::CliDefault);
    let result = generation::execute(
        &world.store,
        &launcher(&world, "EXPLAIN"),
        input.clone(),
        flag(),
    )
    .unwrap();
    let saved = legacy_json(&world);
    world
        .database()
        .execute_batch(
            "ALTER TABLE job_executions DROP COLUMN requested_model; PRAGMA user_version=6;",
        )
        .unwrap();
    let directory = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&directory).unwrap();
    let replay = generation::execute(&store, &CliLauncher::Installed, input, flag()).unwrap();
    let (GenerationOutcome::Explain(expected), GenerationOutcome::Explain(actual)) =
        (result, replay)
    else {
        panic!("expected explanation")
    };
    assert_eq!(actual, expected);
    assert_eq!(
        store.task_conversation(&task, None).unwrap().messages.len(),
        2
    );
    store
        .configure_database_for_test(|db| {
            let json: String =
                db.query_row("SELECT request_json FROM generation_jobs", [], |row| {
                    row.get(0)
                })?;
            assert_eq!(json, saved);
            Ok(())
        })
        .unwrap();
}

#[test]
fn legacy_and_current_replays_reject_changed_request_fields() {
    for legacy in [false, true] {
        let world = World::new();
        let task = add_task(&world, &world.document.id);
        let input = request(&world, &task, ModelSelection::CliDefault);
        world.store.begin_generation(input.clone()).unwrap();
        if legacy {
            legacy_json(&world);
        }
        let mut model = input.clone();
        model.model = ModelSelection::Sonnet;
        let mut instruction = input.clone();
        instruction.instruction = "다른 지시".into();
        let mut scope = input;
        scope.selection = ScopeSelection::Section { cursor: 0 };
        for changed in [model, instruction, scope] {
            assert_eq!(
                world.store.begin_generation(changed).unwrap_err().code,
                ErrorCode::InvalidInput
            );
        }
    }
}

#[test]
fn malformed_saved_request_is_rejected_without_replacement() {
    for malformed in ["[]", "null", "{\"model\":\"unknown\"}"] {
        let world = World::new();
        let task = add_task(&world, &world.document.id);
        let input = request(&world, &task, ModelSelection::CliDefault);
        world.store.begin_generation(input.clone()).unwrap();
        world
            .database()
            .execute("UPDATE generation_jobs SET request_json=?1", [malformed])
            .unwrap();
        assert_eq!(
            world.store.begin_generation(input).unwrap_err().code,
            ErrorCode::InvalidInput
        );
        assert_eq!(stored_json(&world), malformed);
    }
}

#[test]
fn legacy_failed_and_cancelled_requests_still_require_new_ids() {
    for reason in [ErrorCode::NetworkError, ErrorCode::Cancelled] {
        let world = World::new();
        let task = add_task(&world, &world.document.id);
        let input = request(&world, &task, ModelSelection::CliDefault);
        let job = world.store.begin_generation(input.clone()).unwrap();
        world.store.finish_failed_job(&job, reason).unwrap();
        legacy_json(&world);
        assert_eq!(
            world.store.begin_generation(input).unwrap_err().code,
            ErrorCode::Cancelled
        );
    }
}
