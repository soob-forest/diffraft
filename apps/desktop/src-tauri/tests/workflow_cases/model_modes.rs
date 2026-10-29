use crate::{
    model_selection::{flag, launcher, request},
    rewrite_world::RewriteWorld,
    support::World,
    world::{ReviewWorld, add_task},
};
use docreview_core::{
    claude_adapter::{execution::CliLauncher, generation, regeneration, rewrite, settings},
    domain::{
        ai::ResponseMode, conversation::SavedGenerationRequest, model::ModelSelection,
        regeneration::RegenerateRequest, rewrite::RewriteRequest,
    },
};
use std::fs;

const MODELS: [ModelSelection; 4] = [
    ModelSelection::CliDefault,
    ModelSelection::Sonnet,
    ModelSelection::Opus,
    ModelSelection::Haiku,
];

fn expect_model(world: &World, model: ModelSelection) {
    fs::write(
        world.directory.path().join("expected-model"),
        model.alias().unwrap_or("cli_default"),
    )
    .unwrap();
}

fn assert_record(world: &World, job: &str, model: ModelSelection) {
    let value: String = world
        .database()
        .query_row(
            "SELECT requested_model FROM job_executions WHERE job_id=?1",
            [job],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(value, model.alias().unwrap_or("cli_default"));
}

#[test]
fn patch_child_and_record_use_each_saved_model() {
    for model in MODELS {
        let world = World::new();
        let task = add_task(&world, &world.document.id);
        let mut req = request(&world, &task, model);
        req.mode = ResponseMode::Patch;
        let job = req.operation_id.clone();
        expect_model(&world, model);
        generation::execute(&world.store, &launcher(&world, "PATCH_SCOPE"), req, flag()).unwrap();
        assert_record(&world, &job, model);
    }
}

#[test]
fn regeneration_child_and_record_use_each_saved_model() {
    for model in MODELS {
        let world = ReviewWorld::new();
        let mut req = crate::regeneration::request(&world);
        req.model = model;
        let job = req.operation_id.clone();
        expect_model(&world.world, model);
        regeneration::execute(
            &world.world.store,
            &launcher(&world.world, "REGENERATE"),
            req,
            flag(),
        )
        .unwrap();
        assert_record(&world.world, &job, model);
    }
}

#[test]
fn rewrite_and_another_direction_child_use_each_saved_model() {
    for model in MODELS {
        for reference in [true, false] {
            let world = RewriteWorld::new();
            let mut req = crate::rewrite_jobs::request(&world);
            req.model = model;
            if !reference {
                req.reference_batch_id = None;
            }
            let job = req.operation_id.clone();
            expect_model(&world.world, model);
            rewrite::execute(
                &world.world.store,
                &launcher(&world.world, "REWRITE"),
                req,
                flag(),
            )
            .unwrap();
            assert_record(&world.world, &job, model);
        }
    }
}

#[test]
fn legacy_revision_and_rewrite_models_default_and_invalid_values_fail() {
    let revision = crate::regeneration::request(&ReviewWorld::new());
    let rewrite = crate::rewrite_jobs::request(&RewriteWorld::new());
    let mut a = serde_json::to_value(revision).unwrap();
    let mut b = serde_json::to_value(rewrite).unwrap();
    a.as_object_mut().unwrap().remove("model");
    b.as_object_mut().unwrap().remove("model");
    assert_eq!(
        serde_json::from_value::<RegenerateRequest>(a.clone())
            .unwrap()
            .model,
        ModelSelection::CliDefault
    );
    assert_eq!(
        serde_json::from_value::<RewriteRequest>(b.clone())
            .unwrap()
            .model,
        ModelSelection::CliDefault
    );
    a["model"] = "invalid".into();
    b["model"] = "invalid".into();
    assert!(serde_json::from_value::<RegenerateRequest>(a).is_err());
    assert!(serde_json::from_value::<RewriteRequest>(b).is_err());
}

#[test]
fn installed_cli_preparation_failure_preserves_requested_model() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    settings::save(
        world.store.directory(),
        &world.directory.path().join("missing-claude"),
    )
    .unwrap();
    assert!(
        generation::execute(
            &world.store,
            &CliLauncher::Installed,
            request(&world, &task, ModelSelection::Haiku),
            flag()
        )
        .is_err()
    );
    let failed = world
        .store
        .task_conversation(&task, None)
        .unwrap()
        .last_attempt
        .unwrap();
    let SavedGenerationRequest::Generate(saved) = failed.request else {
        panic!("generate")
    };
    assert_eq!(saved.model, ModelSelection::Haiku);
    assert_eq!(failed.status, "FAILED");
}
