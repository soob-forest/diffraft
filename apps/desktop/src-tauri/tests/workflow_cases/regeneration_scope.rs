use crate::{support::World, world::add_task};
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse, ResponseMode},
        editor::ScopeSelection,
        generation::GenerateRequest,
        regeneration::RegenerateRequest,
        review::ReviewBatch,
    },
    storage::runtime::Runtime,
};
use serde_json::Value;

const OUTSIDE: &str = "OUTSIDE_SELECTION_SENTINEL";
const LARGE_REPEATS: usize = 12_000;

fn selected_patch(world: &World) -> ReviewBatch {
    let task = add_task(world, &world.document.id);
    let job = world
        .store
        .begin_generation(GenerateRequest {
            document_id: world.document.id.clone(),
            task_id: task,
            expected_head_id: world.document.version_id.clone(),
            operation_id: world.runtime.id(),
            mode: ResponseMode::Patch,
            selection: ScopeSelection::Section { cursor: 0 },
            instruction: "선택한 문장 개선".into(),
            expected_active_batch_id: None,
            archive_previous: false,
            retry_of: None,
        })
        .unwrap();
    let context = world.store.generation_context(&job).unwrap();
    assert!(!context.contains(OUTSIDE));
    let value: Value = serde_json::from_str(&context).unwrap();
    world
        .store
        .register_patch(&job, &selected_response(&value))
        .unwrap()
}

fn selected_response(value: &Value) -> AiResponse {
    let block = value["scope"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|block| {
            block["before"]
                .as_str()
                .unwrap()
                .contains("Target sentence.")
        })
        .unwrap();
    AiResponse::Patch {
        schema_version: 1,
        summary: "선택 범위 제안".into(),
        changes: vec![AiChange {
            block_id: block["block_id"].as_str().unwrap().into(),
            before: block["before"].as_str().unwrap().into(),
            after: "Better target sentence.".into(),
            reason: "표현 개선".into(),
        }],
    }
}

fn scoped_world(repeats: usize) -> (World, ReviewBatch) {
    let mut world = World::new();
    let mut save = world.request();
    save.content = format!(
        "# Target\nTarget sentence.\n\n# Outside\n{}",
        OUTSIDE.repeat(repeats)
    );
    world.document = world.store.save(save).unwrap();
    let batch = selected_patch(&world);
    (world, batch)
}

fn request(world: &World, batch: &ReviewBatch) -> RegenerateRequest {
    RegenerateRequest {
        document_id: world.document.id.clone(),
        batch_id: batch.id.clone(),
        proposal_id: batch.proposals[0].id.clone(),
        expected_revision: 1,
        expected_head_id: world.document.version_id.clone(),
        operation_id: world.runtime.id(),
        retry_of: None,
        instruction: "선택한 문장만 다시 개선".into(),
    }
}

#[test]
fn regeneration_never_adds_body_outside_the_original_selection() {
    let (world, batch) = scoped_world(1);
    let job = world
        .store
        .begin_regeneration(request(&world, &batch))
        .unwrap();
    let context = world.store.regeneration_context(&job).unwrap();
    assert!(
        !context.contains(OUTSIDE),
        "재제안에서 범위 밖 본문이 추가됐다"
    );
    let value: Value = serde_json::from_str(&context).unwrap();
    assert!(value["confirmed"].get("content").is_none());
    assert_eq!(value["scope"]["text"], batch.proposals[0].operation.before);
    assert_eq!(value["confirmed"]["versionId"], world.document.version_id);
}

#[test]
fn small_target_in_large_document_can_be_regenerated_without_changing_source() {
    let (world, batch) = scoped_world(LARGE_REPEATS);
    let job = world
        .store
        .begin_regeneration(request(&world, &batch))
        .unwrap();
    let context = world.store.regeneration_context(&job).unwrap();
    assert!(!context.contains(OUTSIDE));
    let target = &batch.proposals[0].operation;
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "다시 개선".into(),
        changes: vec![AiChange {
            block_id: target.block_id.clone(),
            before: target.before.clone(),
            after: "Refined target sentence.".into(),
            reason: "코멘트 반영".into(),
        }],
    };
    let revised = world.store.register_regeneration(&job, &response).unwrap();
    assert_eq!(revised.proposals[0].revision, 2);
    assert_eq!(
        std::fs::read_to_string(&world.path).unwrap(),
        world.document.content
    );
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 2);
}

#[test]
fn regeneration_after_partial_accept_uses_current_head_and_remaining_original() {
    let world = crate::world::ReviewWorld::new();
    let head = world
        .world
        .store
        .accept_proposals(world.request(&[0]))
        .unwrap();
    let target = &world.batch.proposals[2];
    let job = world
        .world
        .store
        .begin_regeneration(RegenerateRequest {
            document_id: head.id.clone(),
            batch_id: world.batch.id.clone(),
            proposal_id: target.id.clone(),
            expected_revision: target.revision,
            expected_head_id: head.version_id.clone(),
            operation_id: world.world.runtime.id(),
            retry_of: None,
            instruction: "남은 문장만 개선".into(),
        })
        .unwrap();
    let context: Value =
        serde_json::from_str(&world.world.store.regeneration_context(&job).unwrap()).unwrap();
    assert_eq!(context["confirmed"]["versionId"], head.version_id);
    assert_eq!(
        context["scope"]["baseVersionId"],
        world.batch.base_version_id
    );
    assert_eq!(context["scope"]["text"], target.operation.before);
    assert_eq!(
        std::fs::read_to_string(&world.world.path).unwrap(),
        head.content
    );
}
