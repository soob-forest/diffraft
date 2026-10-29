use crate::{
    support::World,
    world::{ReviewWorld, add_task},
};
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse, ResponseMode},
        editor::ScopeSelection,
        error::ErrorCode,
        generation::{GenerateRequest, GenerationOutcome},
        review::{DecisionRequest, ProposalRevision},
    },
    storage::{generation_models::ExecutionContext, runtime::Runtime},
};

fn request(world: &World, task: &str, mode: ResponseMode) -> GenerateRequest {
    GenerateRequest {
        model: Default::default(),
        document_id: world.document.id.clone(),
        task_id: task.into(),
        expected_head_id: world.document.version_id.clone(),
        operation_id: world.runtime.id(),
        mode,
        selection: ScopeSelection::Whole,
        instruction: "문서를 다듬어 주세요".into(),
        expected_active_batch_id: None,
        archive_previous: false,
        retry_of: None,
    }
}
fn execution(mode: ResponseMode) -> ExecutionContext {
    ExecutionContext {
        requested_model: Some(Default::default()),
        mode,
        requested_session_id: None,
        cwd: "/private/test/task".into(),
        cli_version: "2.1.311".into(),
        retry_of: None,
    }
}
const SESSION: &str = "10000000-0000-4000-8000-000000000001";

#[test]
fn explain_records_only_conversation_and_replays_without_a_candidate() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let request = request(&world, &task, ResponseMode::Explain);
    let job = world.store.begin_generation(request.clone()).unwrap();
    world
        .store
        .record_execution(&job, &execution(ResponseMode::Explain))
        .unwrap();
    let answer = AiResponse::Explain {
        schema_version: 1,
        answer: "검토 답변".into(),
    };
    let result = world
        .store
        .complete_explanation(&job, &answer, SESSION)
        .unwrap();
    assert!(matches!(result,GenerationOutcome::Explain(ref text) if text=="검토 답변"));
    assert!(world.store.task_review(&task).unwrap().batches.is_empty());
    assert_eq!(
        world.store.snapshot(&world.document.id).unwrap().content,
        world.document.content
    );
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 1);
    assert!(
        world
            .store
            .complete_explanation(&job, &answer, SESSION)
            .is_err()
    );
    assert_eq!(
        world.store.begin_generation(request).unwrap().attempt_id,
        job.attempt_id
    );
    let replay = world.store.completed_generation(&job).unwrap().unwrap();
    assert_eq!(
        serde_json::to_value(replay).unwrap(),
        serde_json::to_value(result).unwrap()
    );
}

#[test]
fn selected_scope_reduces_context_without_including_outside_body_and_is_frozen() {
    let mut world = World::new();
    let mut save = world.request();
    save.content = format!(
        "# 전달 범위\n설명할 내용\n\n# 제외 범위\n{}",
        "제외할 본문".repeat(30000)
    );
    world.document = world.store.save(save).unwrap();
    let task = add_task(&world, &world.document.id);
    let mut request = request(&world, &task, ResponseMode::Explain);
    assert_eq!(
        world
            .store
            .begin_generation(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::ContextTooLarge
    );
    request.selection = ScopeSelection::Section { cursor: 0 };
    let job = world.store.begin_generation(request).unwrap();
    let context = world.store.generation_context(&job).unwrap();
    assert!(context.contains("설명할 내용"));
    assert!(!context.contains("제외할 본문"));
    let mut save = world.request();
    save.expected_version = world.document.version;
    world.store.save(save).unwrap();
    assert_eq!(world.store.generation_context(&job).unwrap(), context);
}

#[test]
fn empty_document_patch_stays_unapproved_until_explicit_accept() {
    let mut world = World::new();
    let mut save = world.request();
    save.content.clear();
    world.document = world.store.save(save).unwrap();
    let task = add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_generation(request(&world, &task, ResponseMode::Patch))
        .unwrap();
    world
        .store
        .record_execution(&job, &execution(ResponseMode::Patch))
        .unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "첫 초안".into(),
        changes: vec![AiChange {
            block_id: "b1".into(),
            before: String::new(),
            after: "# 새 문서\n".into(),
            reason: "첫 초안".into(),
        }],
    };
    let batch = world
        .store
        .complete_patch(&job, &response, SESSION)
        .unwrap();
    assert!(
        world
            .store
            .snapshot(&world.document.id)
            .unwrap()
            .content
            .is_empty()
    );
    let decision = DecisionRequest {
        document_id: world.document.id.clone(),
        batch_id: batch.id,
        expected_head_id: world.document.version_id.clone(),
        proposals: vec![ProposalRevision {
            id: batch.proposals[0].id.clone(),
            revision: 1,
        }],
        operation_id: world.runtime.id(),
    };
    assert_eq!(
        world.store.accept_proposals(decision).unwrap().content,
        "# 새 문서\n"
    );
}

#[test]
fn new_patch_requires_confirmation_and_failure_keeps_previous_active_batch() {
    let world = ReviewWorld::new();
    let mut request = request(&world.world, &world.task, ResponseMode::Patch);
    request.expected_head_id = world.head.version_id.clone();
    request.expected_active_batch_id = Some(world.batch.id.clone());
    assert_eq!(
        world
            .world
            .store
            .begin_generation(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    request.archive_previous = true;
    let job = world.world.store.begin_generation(request).unwrap();
    world
        .world
        .store
        .finish_failed_job(&job, ErrorCode::NetworkError)
        .unwrap();
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

#[test]
fn wrong_task_external_file_invalid_instruction_and_changed_replay_create_no_extra_job() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let mut request = request(&world, &task, ResponseMode::Explain);
    request.task_id = world.runtime.id();
    assert!(world.store.begin_generation(request.clone()).is_err());
    request.task_id = task;
    request.instruction.clear();
    assert!(world.store.begin_generation(request.clone()).is_err());
    request.instruction = "정상 지시".into();
    let job = world.store.begin_generation(request.clone()).unwrap();
    request.instruction = "바뀐 지시".into();
    assert_eq!(
        world
            .store
            .begin_generation(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    world
        .store
        .finish_failed_job(&job, ErrorCode::Cancelled)
        .unwrap();
    request.operation_id = world.runtime.id();
    std::fs::write(&world.path, "외부 수정 보존").unwrap();
    assert_eq!(
        world.store.begin_generation(request).unwrap_err().code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        std::fs::read_to_string(&world.path).unwrap(),
        "외부 수정 보존"
    );
}

#[test]
fn explanation_job_cannot_be_registered_as_patch_even_without_execution_metadata() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_generation(request(&world, &task, ResponseMode::Explain))
        .unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "우회".into(),
        changes: vec![],
    };
    assert_eq!(
        world
            .store
            .register_patch(&job, &response)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    assert!(world.store.task_review(&task).unwrap().batches.is_empty());
}

#[test]
fn general_request_cannot_bypass_explicit_whole_rewrite_confirmation() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_generation(request(&world, &task, ResponseMode::Explain))
        .unwrap();
    let rewrite = AiResponse::Rewrite {
        schema_version: 1,
        summary: "우회".into(),
        candidate_markdown: "# 잘못된 후보".into(),
    };
    assert!(world.store.register_rewrite(&job, &rewrite).is_err());
    assert!(world.store.task_review(&task).unwrap().batches.is_empty());
}
