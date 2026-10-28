use crate::{
    rewrite_world::RewriteWorld,
    support::World,
    world::{ReviewWorld, add_task},
};
use docreview_core::{
    domain::{
        MAX_CONTEXT_BYTES, error::ErrorCode, history::RestoreRequest,
        regeneration::RegenerateRequest,
    },
    storage::runtime::Runtime,
};
use rusqlite::params;
use serde_json::Value;

fn request(world: &ReviewWorld) -> RegenerateRequest {
    let target = &world.batch.proposals[0];
    RegenerateRequest {
        document_id: world.head.id.clone(),
        batch_id: world.batch.id.clone(),
        proposal_id: target.id.clone(),
        expected_revision: target.revision,
        expected_head_id: world.head.version_id.clone(),
        operation_id: world.world.runtime.id(),
        retry_of: None,
        instruction: "표현을 구체적으로".into(),
    }
}
fn message(world: &World, task: &str, sequence: u32, content: &str) {
    world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES(?1,?2,?3,'USER',?4,0)", params![world.runtime.id(), task,sequence,content]).unwrap();
}

#[test]
fn regeneration_includes_only_own_conversation_rules_and_rejected_original_text() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    let other = add_task(&world.world, &world.head.id);
    message(&world.world, &world.task, 2, "두 번째 지시");
    message(&world.world, &world.task, 1, "첫 번째 지시");
    message(&world.world, &other, 1, "다른 작업의 제외할 지시");
    world
        .world
        .database()
        .execute(
            "UPDATE documents SET common_rules='독자는 여행자' WHERE id=?1",
            [&world.head.id],
        )
        .unwrap();
    store.reject_proposals(world.request(&[1])).unwrap();
    let job = store.begin_regeneration(request(&world)).unwrap();
    let json = store.regeneration_context(&job).unwrap();
    let context: Value = serde_json::from_str(&json).unwrap();
    assert_eq!(context["commonRules"], "독자는 여행자");
    assert_eq!(context["messages"][0]["content"], "첫 번째 지시");
    assert_eq!(context["messages"][1]["content"], "두 번째 지시");
    assert_eq!(context["messages"].as_array().unwrap().len(), 2);
    assert_eq!(context["decisions"].as_array().unwrap().len(), 1);
    assert_eq!(context["decisions"][0]["kind"], "reject");
    assert_eq!(
        context["decisions"][0]["changes"][0]["after"],
        world.batch.proposals[1].operation.after
    );
    assert!(!json.contains("다른 작업의 제외할 지시"));
    message(&world.world, &world.task, 3, "요청 이후 추가한 지시");
    assert_eq!(store.regeneration_context(&job).unwrap(), json);
}

#[test]
fn rewrite_after_restore_uses_current_confirmed_content_and_ordered_restore_event() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    message(&world.world, &world.task, 1, "복원 이전 대화");
    let restored = store
        .restore_version(RestoreRequest {
            document_id: world.head.id.clone(),
            expected_head_id: world.head.version_id.clone(),
            target_version_id: world.world.document.version_id.clone(),
            operation_id: world.world.runtime.id(),
        })
        .unwrap();
    let mut request = crate::rewrite_jobs::request(&world);
    request.expected_head_id = restored.version_id.clone();
    request.reference_batch_id = None;
    let job = store.begin_rewrite(request).unwrap();
    let context: Value = serde_json::from_str(&store.rewrite_context(&job).unwrap()).unwrap();
    assert_eq!(context["confirmed"]["versionId"], restored.version_id);
    assert_eq!(context["confirmed"]["content"], restored.content);
    assert_eq!(context["decisions"][0]["kind"], "restore");
    assert_eq!(
        context["decisions"][0]["payload"]["effects"]["request"]["targetVersionId"],
        world.world.document.version_id
    );
    assert_eq!(context["messages"][0]["content"], "복원 이전 대화");
}

#[test]
fn summary_cursor_excludes_old_events_and_oversized_history_creates_no_job() {
    let world = ReviewWorld::new();
    let store = &world.world.store;
    store.reject_proposals(world.request(&[1])).unwrap();
    let sequence = store.workspace().unwrap().sequence;
    world
        .world
        .database()
        .execute(
            "UPDATE tasks SET summary='이전 결정 요약',summary_event_seq=?1 WHERE id=?2",
            params![sequence, world.task],
        )
        .unwrap();
    let job = store.begin_regeneration(request(&world)).unwrap();
    let context: Value = serde_json::from_str(&store.regeneration_context(&job).unwrap()).unwrap();
    assert_eq!(context["summary"], "이전 결정 요약");
    assert_eq!(context["historyAfterSequence"], sequence);
    assert!(context["decisions"].as_array().unwrap().is_empty());
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    message(
        &world.world,
        &world.task,
        1,
        &"한".repeat(MAX_CONTEXT_BYTES / 3 + 1),
    );
    assert_eq!(
        store.begin_regeneration(request(&world)).unwrap_err().code,
        ErrorCode::ContextTooLarge
    );
    assert!(!store.task_review(&world.task).unwrap().generating);
}
