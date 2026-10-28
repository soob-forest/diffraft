use crate::{rewrite_jobs::request, rewrite_world::RewriteWorld, support::World, world::add_task};
use docreview_core::{
    domain::{
        ai::ResponseMode,
        conversation::{SavedGenerationRequest, TaskSessionState},
        error::ErrorCode,
    },
    storage::{Store, generation_models::ExecutionContext, runtime::Runtime},
};
use rusqlite::params;

#[test]
fn conversation_pages_are_task_isolated_ordered_by_sequence_and_have_no_gaps() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let other = add_task(&world, &world.document.id);
    for sequence in 1..=25 {
        world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES(?1,?2,?3,'USER',?4,?5)",params![world.runtime.id(),task,sequence,format!("메시지 {sequence}"),100-sequence]).unwrap();
    }
    world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES(?1,?2,1,'USER','다른 작업',0)",params![world.runtime.id(),other]).unwrap();
    let page = world.store.task_conversation(&task, None).unwrap();
    assert_eq!(
        page.messages
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        (6..=25).collect::<Vec<_>>()
    );
    let older = world
        .store
        .task_conversation(&task, page.earlier_before)
        .unwrap();
    assert_eq!(
        older
            .messages
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        (1..=5).collect::<Vec<_>>()
    );
    assert!(older.earlier_before.is_none());
    assert!(matches!(page.session, TaskSessionState::Local));
    assert_eq!(
        world
            .store
            .task_conversation(&other, None)
            .unwrap()
            .messages
            .len(),
        1
    );
    assert!(world.store.task_conversation(&task, Some(0)).is_err());
}

#[test]
fn failure_snapshot_restores_saved_instruction_and_original_request_after_restart() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let request = request(&world);
    let job = store.begin_rewrite(request.clone()).unwrap();
    store
        .record_execution(
            &job,
            &ExecutionContext {
                mode: ResponseMode::Rewrite,
                requested_session_id: None,
                cwd: "/private/test/task".into(),
                cli_version: "2.1.311".into(),
                retry_of: None,
            },
        )
        .unwrap();
    store
        .finish_failed_job(&job, ErrorCode::NetworkError)
        .unwrap();
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    let page = store.task_conversation(&world.task, None).unwrap();
    assert_eq!(page.messages.len(), 1);
    assert_eq!(page.messages[0].content, request.instruction);
    let attempt = page.last_attempt.unwrap();
    assert_eq!(attempt.job_id, job.id);
    assert_eq!(attempt.attempt_id, job.attempt_id);
    assert_eq!(attempt.status, "FAILED");
    assert_eq!(attempt.error_code, Some(ErrorCode::NetworkError));
    let SavedGenerationRequest::Rewrite(restored) = attempt.request else {
        panic!("rewrite request");
    };
    assert_eq!(*restored, request);
}

#[test]
fn common_rules_are_shared_with_new_tasks_bounded_and_frozen_per_request() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    store
        .common_rules(&world.head.id, Some("독자는 여행자"))
        .unwrap();
    let job = store.begin_rewrite(request(&world)).unwrap();
    let frozen = store.rewrite_context(&job).unwrap();
    store
        .common_rules(&world.head.id, Some("독자는 처음 여행하는 사람"))
        .unwrap();
    assert_eq!(store.rewrite_context(&job).unwrap(), frozen);
    assert!(frozen.contains("독자는 여행자"));
    let other = add_task(&world.world, &world.head.id);
    assert_eq!(
        store.task_conversation(&other, None).unwrap().common_rules,
        "독자는 처음 여행하는 사람"
    );
    assert!(
        store
            .common_rules(&world.head.id, Some(&"한".repeat(6000)))
            .is_err()
    );
    assert!(store.common_rules(&world.head.id, Some("\0")).is_err());
    assert_eq!(
        store.common_rules(&world.head.id, None).unwrap(),
        "독자는 처음 여행하는 사람"
    );
}
