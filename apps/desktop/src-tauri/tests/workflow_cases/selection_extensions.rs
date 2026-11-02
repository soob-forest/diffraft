use crate::{rewrite_world::RewriteWorld, world::ReviewWorld};
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse},
        regeneration::CandidateSelection,
        selection_request::{SelectionJobTarget, SelectionRequest},
    },
    storage::runtime::Runtime,
};

pub(super) fn request(world: &ReviewWorld, quote: &str, from: usize) -> SelectionRequest {
    SelectionRequest {
        model: Default::default(),
        document_id: world.head.id.clone(),
        task_id: world.task.clone(),
        expected_head_id: world.head.version_id.clone(),
        operation_id: world.world.runtime.id(),
        instruction: "선택 표현만 개선".into(),
        target: SelectionJobTarget::Confirmed(CandidateSelection {
            task_id: world.task.clone(),
            from_utf16: world.head.content[..from].encode_utf16().count() as u32,
            to_utf16: world.head.content[..from + quote.len()]
                .encode_utf16()
                .count() as u32,
            quote: quote.into(),
        }),
        comment_ids: vec![],
        context_hash: None,
        retry_of: None,
    }
}
#[test]
fn unchanged_confirmed_selection_adds_a_batch_without_archiving_pending_proposals() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let quote = "출발 시간과 이동 경로를 함께 기록합니다.";
    let prepared = store
        .prepare_selection_request(request(
            &world,
            quote,
            world.head.content.find(quote).unwrap(),
        ))
        .unwrap();
    let context: serde_json::Value = serde_json::from_str(&prepared.context).unwrap();
    let job = store.begin_selection_request(prepared.request).unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "새 부분 제안".into(),
        changes: vec![AiChange {
            block_id: context["scope"]["blocks"][0]["block_id"]
                .as_str()
                .unwrap()
                .into(),
            before: quote.into(),
            after: "출발 시간과 이동 경로를 기록해 둡니다.".into(),
            reason: "간결하게".into(),
        }],
    };
    let added = store
        .complete_selection_request(&job, &response, None)
        .unwrap();
    assert_ne!(added.id, world.batch.id);
    let old = store.review_batch(&world.batch.id).unwrap();
    assert_eq!(old.status, "ACTIVE");
    assert_eq!(
        old.proposals[0].operation.after,
        world.batch.proposals[0].operation.after
    );
    assert_eq!(
        store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
}
#[test]
fn a_pending_original_range_cannot_be_registered_again_as_a_new_selection() {
    let world = ReviewWorld::new();
    let old = &world.batch.proposals[0].operation;
    assert!(
        world
            .world
            .store
            .prepare_selection_request(request(&world, &old.before, old.range.from as usize))
            .is_err()
    );
}
#[test]
fn rewrite_candidate_selection_preserves_the_rest_and_keeps_whole_apply() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let candidate = world.batch.candidate_markdown.clone().unwrap();
    let quote = candidate.chars().take(3).collect::<String>();
    let input = rewrite_request(&world, &candidate, &quote);
    let prepared = store.prepare_selection_request(input).unwrap();
    let job = store.begin_selection_request(prepared.request).unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "새 전체 후보".into(),
        changes: vec![AiChange {
            block_id: "candidate".into(),
            before: quote.clone(),
            after: "# 새 제목".into(),
            reason: "간결하게".into(),
        }],
    };
    let batch = store
        .complete_selection_request(&job, &response, None)
        .unwrap();
    assert_eq!(batch.mode, "REWRITE");
    assert_eq!(
        batch.candidate_markdown.unwrap(),
        format!("# 새 제목{}", &candidate[quote.len()..])
    );
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ARCHIVED"
    );
    assert_eq!(
        store.snapshot(&world.head.id).unwrap().content,
        world.head.content
    );
}

pub(super) fn rewrite_request(
    world: &RewriteWorld,
    candidate: &str,
    quote: &str,
) -> SelectionRequest {
    SelectionRequest {
        model: Default::default(),
        document_id: world.head.id.clone(),
        task_id: world.task.clone(),
        expected_head_id: world.head.version_id.clone(),
        operation_id: world.world.runtime.id(),
        instruction: "선택만 개선".into(),
        target: SelectionJobTarget::Rewrite {
            batch_id: world.batch.id.clone(),
            candidate_hash: docreview_core::storage::files::content_hash(candidate),
            selection: CandidateSelection {
                task_id: world.task.clone(),
                from_utf16: 0,
                to_utf16: quote.encode_utf16().count() as u32,
                quote: quote.into(),
            },
        },
        comment_ids: vec![],
        context_hash: None,
        retry_of: None,
    }
}

#[test]
fn a_new_selection_inside_approved_text_uses_the_current_head_and_preserves_pending() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let approved = world.batch.proposals[0].operation.after.clone();
    store.accept_proposals(world.request(&[0])).unwrap();
    let head = store.snapshot(&world.head.id).unwrap();
    let from = head.content.find(&approved).unwrap();
    let quote = approved.chars().take(3).collect::<String>();
    let unchanged = "출발 시간과 이동 경로를 함께 기록합니다.";
    let mut input = request(
        &world,
        unchanged,
        world.head.content.find(unchanged).unwrap(),
    );
    input.expected_head_id = head.version_id.clone();
    input.target = SelectionJobTarget::Confirmed(CandidateSelection {
        task_id: world.task.clone(),
        from_utf16: head.content[..from].encode_utf16().count() as u32,
        to_utf16: head.content[..from + quote.len()].encode_utf16().count() as u32,
        quote,
    });
    let prepared = store.prepare_selection_request(input).unwrap();
    let context: serde_json::Value = serde_json::from_str(&prepared.context).unwrap();
    assert_eq!(context["confirmed"]["versionId"], head.version_id);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().proposals[0].decision,
        docreview_core::domain::review::Decision::Accepted
    );
}
