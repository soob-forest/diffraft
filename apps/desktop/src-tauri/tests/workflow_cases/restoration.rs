use crate::support::{INITIAL_CONTENT, World};
use docreview_core::{
    domain::{
        annotations::ReviewSide, editor::ScopeSelection, error::ErrorCode, history::RestoreRequest,
        review::Validity,
    },
    storage::{models::SaveReason, review_jobs::BeginReviewJob, runtime::Runtime},
};
use std::fs;

pub fn request(world: &World, head: &str) -> RestoreRequest {
    RestoreRequest {
        document_id: world.document.id.clone(),
        expected_head_id: head.into(),
        target_version_id: world.document.version_id.clone(),
        operation_id: world.runtime.id(),
    }
}

#[test]
fn generic_save_cannot_bypass_restore_target_validation() {
    let world = World::new();
    let mut request = world.request();
    request.reason = SaveReason::Restore;
    assert_eq!(
        world.store.save(request).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_eq!(
        std::fs::read_to_string(&world.path).unwrap(),
        INITIAL_CONTENT
    );
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 1);
}

#[test]
fn comparison_is_current_to_target_and_restore_creates_a_new_immutable_version() {
    let world = World::new();
    let edited = world.store.save(world.request()).unwrap();
    let request = request(&world, &edited.version_id);
    let comparison = world
        .store
        .version_comparison(&edited.id, &edited.version_id, &request.target_version_id)
        .unwrap();
    assert_eq!(comparison.before, edited.content);
    assert_eq!(comparison.after, INITIAL_CONTENT);
    assert_eq!(
        (comparison.current_version, comparison.target.number),
        (2, 1)
    );
    let restored = world.store.restore_version(request.clone()).unwrap();
    assert_eq!(
        (restored.version, restored.content.as_str()),
        (3, INITIAL_CONTENT)
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
    assert_eq!(
        world.store.version_content(&edited.id, 2).unwrap(),
        edited.content
    );
    assert_eq!(
        world.store.versions(&edited.id).unwrap()[0].reason,
        "restore"
    );
    assert_eq!(
        world
            .store
            .restore_version(request.clone())
            .unwrap()
            .version_id,
        restored.version_id
    );
    assert_restore_event(&world, &request);
    let mut changed = request;
    changed.target_version_id = edited.version_id;
    assert_eq!(
        world.store.restore_version(changed).unwrap_err().code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn restore_preserves_comments_and_conversation_but_stales_every_tasks_pending_changes() {
    let world = crate::world::ReviewWorld::new();
    let comment = world
        .world
        .store
        .add_comment(crate::comments::comment_request(&world, ReviewSide::Before))
        .unwrap();
    let other = crate::world::add_task(&world.world, &world.head.id);
    let batch =
        crate::world::register(&world.world, &world.head, &other, &crate::world::response());
    world.world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES(?1,?2,1,'USER','이전 대화',0)", [&world.world.runtime.id(), &world.task]).unwrap();
    let restored = world
        .world
        .store
        .restore_version(request(&world.world, &world.head.version_id))
        .unwrap();
    assert_eq!(restored.version, 13);
    for id in [&world.batch.id, &batch.id] {
        assert!(
            world
                .world
                .store
                .review_batch(id)
                .unwrap()
                .proposals
                .iter()
                .all(|proposal| proposal.validity == Validity::Stale)
        );
    }
    assert_eq!(
        world.world.store.review_comments(&world.task).unwrap()[0].id,
        comment.id
    );
    let message: String = world
        .world
        .database()
        .query_row(
            "SELECT content FROM messages WHERE task_id=?1",
            [&world.task],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(message, "이전 대화");
}

#[test]
fn foreign_target_stale_head_and_external_file_are_rejected_without_writes() {
    let world = World::new();
    let other_path = world.directory.path().join("other.md");
    fs::write(&other_path, "다른 문서\n").unwrap();
    let other = world.store.open_document(&other_path).unwrap();
    let mut foreign = request(&world, &world.document.version_id);
    foreign.target_version_id = other.version_id;
    assert_eq!(
        world
            .store
            .restore_version(foreign.clone())
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    assert!(
        world
            .store
            .version_comparison(
                &world.document.id,
                &world.document.version_id,
                &foreign.target_version_id
            )
            .is_err()
    );
    let stale = request(&world, &world.document.version_id);
    let edited = world.store.save(world.request()).unwrap();
    assert_eq!(
        world.store.restore_version(stale).unwrap_err().code,
        ErrorCode::StaleBase
    );
    fs::write(&world.path, "외부 편집\n").unwrap();
    assert_eq!(
        world
            .store
            .restore_version(request(&world, &edited.version_id))
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "외부 편집\n");
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 2);
}

#[test]
fn active_generation_and_database_failure_preserve_current_state() {
    let world = World::new();
    let task = crate::world::add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: world.document.id.clone(),
            task_id: task,
            expected_version: 1,
            selection: ScopeSelection::Whole,
        })
        .unwrap();
    assert_eq!(
        world
            .store
            .restore_version(request(&world, &world.document.version_id))
            .unwrap_err()
            .code,
        ErrorCode::Busy
    );
    world
        .store
        .finish_failed_job(&job, ErrorCode::Cancelled)
        .unwrap();
    world
        .store
        .configure_database_for_test(|connection| connection.execute_batch("PRAGMA query_only=ON"))
        .unwrap();
    assert_eq!(
        world
            .store
            .restore_version(request(&world, &world.document.version_id))
            .unwrap_err()
            .code,
        ErrorCode::SaveFailed
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 1);
}

fn assert_restore_event(world: &World, request: &RestoreRequest) {
    let payload: String = world
        .database()
        .query_row(
            "SELECT payload FROM decision_events WHERE kind='restore'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let event: serde_json::Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(
        event["effects"]["request"]["targetVersionId"],
        request.target_version_id
    );
}
