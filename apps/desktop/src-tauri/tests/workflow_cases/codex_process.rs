use crate::{
    model_selection::{flag, request},
    rewrite_world::RewriteWorld,
    support::World,
    world::{ReviewWorld, add_task},
};
use docreview_core::{
    claude_adapter::{
        execution::CliLauncher, generation, process::ProcessSpec, regeneration, rewrite,
    },
    domain::{
        ai::ResponseMode,
        error::ErrorCode,
        model::ModelSelection,
        provider::{ProviderModel, ReasoningEffort},
    },
};
use std::{path::PathBuf, time::Duration};

fn model() -> ProviderModel {
    ProviderModel::Codex {
        model: "fixture-codex".into(),
        effort: ReasoningEffort::Low,
    }
}
pub(super) fn fixture(world: &World, mode: &str) -> CliLauncher {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    CliLauncher::CodexFixture(ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-codex.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: world.directory.path().canonicalize().unwrap(),
        environment: std::collections::BTreeMap::from([(
            "HOME".into(),
            world.directory.path().as_os_str().to_owned(),
        )]),
        timeout: Duration::from_secs(5),
    })
}

#[test]
fn codex_explain_patch_and_session_resume_use_the_pinned_model_without_claude() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    for mode in [ResponseMode::Explain, ResponseMode::Patch] {
        let mut input = request(&world, &task, ModelSelection::CliDefault);
        input.mode = mode;
        input.model = model();
        generation::execute(&world.store, &fixture(&world, "SUCCESS"), input, flag()).unwrap();
    }
    assert_eq!(
        world
            .store
            .task_conversation(&task, None)
            .unwrap()
            .messages
            .len(),
        4
    );
    assert!(world.store.active_session(&task).unwrap().is_none());
    assert_eq!(world.store.task_review(&task).unwrap().batches.len(), 1);
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        world.document.content
    );
}

#[test]
fn codex_regeneration_rewrite_and_another_direction_register_only_unapproved_results() {
    let world = ReviewWorld::new();
    let mut revision = crate::regeneration::request(&world);
    revision.model = model();
    regeneration::execute(
        &world.world.store,
        &fixture(&world.world, "SUCCESS"),
        revision,
        flag(),
    )
    .unwrap();
    for reference in [false, true] {
        let world = RewriteWorld::new();
        let mut input = crate::rewrite_jobs::request(&world);
        input.model = model();
        if !reference {
            input.reference_batch_id = None;
        }
        rewrite::execute(
            &world.world.store,
            &fixture(&world.world, "SUCCESS"),
            input,
            flag(),
        )
        .unwrap();
        assert_eq!(
            world
                .world
                .store
                .snapshot(&world.world.document.id)
                .unwrap()
                .content,
            world.head.content
        );
    }
}

#[test]
fn codex_auth_policy_format_tool_account_and_event_failures_preserve_source() {
    for (mode, code) in [
        ("AUTH_REQUIRED", ErrorCode::AuthRequired),
        ("LIMIT", ErrorCode::RateOrPolicy),
        ("MALFORMED", ErrorCode::OutputInvalid),
        ("WRONG_THREAD", ErrorCode::OutputInvalid),
        ("TOOL", ErrorCode::OutputInvalid),
        ("ACCOUNT_CHANGED", ErrorCode::AuthRequired),
    ] {
        let world = World::new();
        let task = add_task(&world, &world.document.id);
        let mut input = request(&world, &task, ModelSelection::CliDefault);
        input.model = model();
        let error =
            generation::execute(&world.store, &fixture(&world, mode), input, flag()).unwrap_err();
        assert_eq!(error.code, code, "mode: {mode}");
        assert!(!error.message.contains("SECRET_FIXTURE"));
        assert_eq!(
            world.store.snapshot(&world.document.id).unwrap().content,
            world.document.content
        );
        assert!(world.store.task_review(&task).unwrap().batches.is_empty());
        assert!(!world.store.directory().join("cli-process.json").exists());
    }
}
