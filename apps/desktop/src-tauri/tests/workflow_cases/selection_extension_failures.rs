use crate::{
    rewrite_world::RewriteWorld,
    selection_extensions::{request, rewrite_request},
    world::ReviewWorld,
};
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse},
        error::ErrorCode,
        provider::{ProviderModel, ReasoningEffort},
    },
    providers,
    storage::runtime::Runtime,
};

#[test]
fn extended_selection_contract_is_supported_by_both_providers() {
    for codex in [false, true] {
        let world = ReviewWorld::new();
        let quote = "출발 시간과 이동 경로를 함께 기록합니다.";
        let mut input = request(&world, quote, world.head.content.find(quote).unwrap());
        let launcher = if codex {
            input.model = ProviderModel::Codex {
                model: "fixture-codex".into(),
                effort: ReasoningEffort::Low,
            };
            crate::codex_process::fixture(&world.world, "SUCCESS")
        } else {
            crate::model_selection::launcher(&world.world, "REGENERATE")
        };
        let input = world
            .world
            .store
            .prepare_selection_request(input)
            .unwrap()
            .request;
        let batch = providers::selection::execute(
            &world.world.store,
            &launcher,
            input,
            crate::model_selection::flag(),
        )
        .unwrap();
        assert_eq!(batch.mode, "PATCH");
        assert_eq!(
            world
                .world
                .store
                .review_batch(&world.batch.id)
                .unwrap()
                .status,
            "ACTIVE"
        );
    }
    for codex in [false, true] {
        rewrite_provider(codex);
    }
}
fn rewrite_provider(codex: bool) {
    let world = RewriteWorld::new();
    let candidate = world.batch.candidate_markdown.as_ref().unwrap();
    let quote = candidate.chars().take(3).collect::<String>();
    let mut input = rewrite_request(&world, candidate, &quote);
    let launcher = if codex {
        input.model = ProviderModel::Codex {
            model: "fixture-codex".into(),
            effort: ReasoningEffort::Low,
        };
        crate::codex_process::fixture(&world.world, "SUCCESS")
    } else {
        crate::model_selection::launcher(&world.world, "REGENERATE")
    };
    let input = world
        .world
        .store
        .prepare_selection_request(input)
        .unwrap()
        .request;
    let batch = providers::selection::execute(
        &world.world.store,
        &launcher,
        input,
        crate::model_selection::flag(),
    )
    .unwrap();
    assert_eq!(batch.mode, "REWRITE");
    assert!(
        batch
            .candidate_markdown
            .unwrap()
            .ends_with(&candidate[quote.len()..])
    );
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
}
#[test]
fn extension_retry_preserves_confirmed_context_and_replay_is_idempotent() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let quote = "출발 시간과 이동 경로를 함께 기록합니다.";
    let input = store
        .prepare_selection_request(request(
            &world,
            quote,
            world.head.content.find(quote).unwrap(),
        ))
        .unwrap()
        .request;
    let launcher = crate::model_selection::launcher(&world.world, "malformed");
    assert!(
        providers::selection::execute(
            store,
            &launcher,
            input.clone(),
            crate::model_selection::flag()
        )
        .is_err()
    );
    let mut retry = input.clone();
    retry.operation_id = world.world.runtime.id();
    retry.retry_of = Some(input.operation_id);
    let prepared = store.prepare_selection_request(retry.clone()).unwrap();
    assert_eq!(prepared.request, retry);
    let launcher = crate::model_selection::launcher(&world.world, "REGENERATE");
    let result = providers::selection::execute(
        store,
        &launcher,
        retry.clone(),
        crate::model_selection::flag(),
    )
    .unwrap();
    let replay =
        providers::selection::execute(store, &launcher, retry, crate::model_selection::flag())
            .unwrap();
    assert_eq!(result.id, replay.id);
}
#[test]
fn cancelled_or_wrong_rewrite_selection_never_replaces_the_previous_candidate() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let candidate = world.batch.candidate_markdown.as_ref().unwrap();
    let quote = candidate.chars().take(3).collect::<String>();
    let input = store
        .prepare_selection_request(rewrite_request(&world, candidate, &quote))
        .unwrap()
        .request;
    let job = store.begin_selection_request(input).unwrap();
    let wrong = AiResponse::Patch {
        schema_version: 1,
        summary: "wrong".into(),
        changes: vec![AiChange {
            block_id: "candidate".into(),
            before: "wrong".into(),
            after: "outside".into(),
            reason: "invalid".into(),
        }],
    };
    assert!(
        store
            .complete_selection_request(&job, &wrong, None)
            .is_err()
    );
    assert!(store.register_patch(&job, &wrong).is_err());
    store.cancel_generation(&job.id).unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "late".into(),
        changes: vec![AiChange {
            block_id: "candidate".into(),
            before: quote,
            after: "late".into(),
            reason: "late".into(),
        }],
    };
    assert!(
        store
            .complete_selection_request(&job, &response, None)
            .is_err()
    );
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    assert_eq!(
        store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
}
