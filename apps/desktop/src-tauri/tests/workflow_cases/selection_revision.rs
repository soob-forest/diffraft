use crate::{regeneration, world::ReviewWorld};
use docreview_core::{
    claude_adapter::regeneration as adapter,
    domain::{
        error::ErrorCode,
        provider::{ProviderModel, ReasoningEffort},
        regeneration::RegenerateRequest,
    },
    storage::runtime::Runtime,
};
use docreview_core::{
    document::selection::replace_selection,
    domain::{
        ai::{AiChange, AiResponse},
        regeneration::{CandidateSelection, RegenerationOptions, RegenerationTarget},
    },
};

fn selected_request(world: &ReviewWorld) -> RegenerateRequest {
    let mut request = regeneration::request(world);
    let old = world
        .world
        .store
        .proposal_revision(&request.batch_id, &request.proposal_id, 1)
        .unwrap();
    let quote = old.operation.after.chars().take(3).collect::<String>();
    request.options = Some(RegenerationOptions {
        target: RegenerationTarget::CandidateSelection(CandidateSelection {
            task_id: world.task.clone(),
            from_utf16: 0,
            to_utf16: quote.encode_utf16().count() as u32,
            quote,
        }),
        comment_ids: Some(vec![]),
        context_hash: None,
    });
    request
}

#[test]
fn both_providers_follow_the_selected_patch_contract_without_writing_the_file() {
    for codex in [false, true] {
        let world = ReviewWorld::new();
        let mut input = selected_request(&world);
        if codex {
            input.model = ProviderModel::Codex {
                model: "fixture-codex".into(),
                effort: ReasoningEffort::Low,
            };
        }
        let input = world
            .world
            .store
            .prepare_regeneration(input)
            .unwrap()
            .request;
        let launcher = if codex {
            crate::codex_process::fixture(&world.world, "SUCCESS")
        } else {
            crate::model_selection::launcher(&world.world, "REGENERATE")
        };
        let id = input.proposal_id.clone();
        adapter::execute(
            &world.world.store,
            &launcher,
            input,
            crate::model_selection::flag(),
        )
        .unwrap();
        assert_eq!(
            world
                .world
                .store
                .proposal_revision(&world.batch.id, &id, 2)
                .unwrap()
                .revision,
            2
        );
        assert_eq!(
            world.world.store.snapshot(&world.head.id).unwrap().content,
            world.head.content
        );
    }
}
#[test]
fn selected_manual_retry_reuses_the_confirmed_context_and_model() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let original = store
        .prepare_regeneration(selected_request(&world))
        .unwrap()
        .request;
    assert!(
        adapter::execute(
            store,
            &crate::model_selection::launcher(&world.world, "malformed"),
            original.clone(),
            crate::model_selection::flag()
        )
        .is_err()
    );
    let mut retry = original.clone();
    retry.operation_id = world.world.runtime.id();
    retry.retry_of = Some(original.operation_id);
    adapter::execute(
        store,
        &crate::model_selection::launcher(&world.world, "REGENERATE"),
        retry,
        crate::model_selection::flag(),
    )
    .unwrap();
}
#[test]
fn changed_confirmation_and_cancelled_results_never_register_a_new_revision() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let prepared = store
        .prepare_regeneration(selected_request(&world))
        .unwrap();
    store.common_rules(&world.head.id, Some("새 조건")).unwrap();
    assert!(store.begin_regeneration(prepared.request).is_err());
    let prepared = store
        .prepare_regeneration(selected_request(&world))
        .unwrap();
    let job = store.begin_regeneration(prepared.request.clone()).unwrap();
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "늦은 응답".into(),
        changes: vec![],
    };
    assert!(store.register_regeneration(&job, &response).is_err());
    assert_eq!(
        store
            .proposal_revision(&world.batch.id, &prepared.request.proposal_id, 1)
            .unwrap()
            .revision,
        1
    );
}

#[test]
fn exact_candidate_splice_preserves_unicode_repeated_text_and_crlf() {
    let selection = CandidateSelection {
        task_id: "task".into(),
        from_utf16: 6,
        to_utf16: 10,
        quote: "한😀글".into(),
    };
    let original = "\u{feff}앞\r\n뒤 한😀글 한😀글\r\n";
    assert_eq!(
        replace_selection(original, &selection, "새 표현").unwrap(),
        "\u{feff}앞\r\n뒤 새 표현 한😀글\r\n"
    );
    let mut invalid = selection.clone();
    invalid.to_utf16 = 8;
    assert!(replace_selection(original, &invalid, "x").is_err());
}
#[test]
fn selected_request_requires_confirmation_and_only_splices_the_selected_candidate() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let mut request = regeneration::request(&world);
    let old = store
        .proposal_revision(&request.batch_id, &request.proposal_id, 1)
        .unwrap();
    let quote = old.operation.after.chars().take(3).collect::<String>();
    request.options = Some(RegenerationOptions {
        target: RegenerationTarget::CandidateSelection(CandidateSelection {
            task_id: world.task.clone(),
            from_utf16: 0,
            to_utf16: quote.encode_utf16().count() as u32,
            quote: quote.clone(),
        }),
        comment_ids: Some(vec![]),
        context_hash: None,
    });
    assert!(store.begin_regeneration(request.clone()).is_err());
    let prepared = store.prepare_regeneration(request).unwrap();
    let context: serde_json::Value = serde_json::from_str(&prepared.context).unwrap();
    assert_eq!(context["scope"]["text"], quote);
    assert_eq!(context["editableSource"], "unapproved_candidate");
    let job = store.begin_regeneration(prepared.request.clone()).unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "부분 수정".into(),
        changes: vec![AiChange {
            block_id: old.operation.block_id.clone(),
            before: quote.clone(),
            after: "새 표현".into(),
            reason: "간결하게".into(),
        }],
    };
    let batch = store.register_regeneration(&job, &response).unwrap();
    let revised = store.proposal_revision(&batch.id, &old.id, 2).unwrap();
    assert_eq!(
        revised.operation.after,
        format!("새 표현{}", &old.operation.after[quote.len()..])
    );
    assert_eq!(
        store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
}
