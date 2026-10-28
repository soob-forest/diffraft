use docreview_core::{
    claude_adapter::coordinator::Coordinator,
    domain::{
        editor::{ScopeSelection, TaskSnapshot},
        error::ErrorCode,
    },
    storage::{Store, review_jobs::BeginReviewJob},
};
use std::{
    fs,
    sync::{Arc, atomic::Ordering},
};

const FIRST: &str = "00000000-0000-4000-8000-000000000001";
const SECOND: &str = "00000000-0000-4000-8000-000000000002";

#[test]
fn global_slot_stays_held_until_worker_exits_and_old_cancel_cannot_stop_new_request() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let coordinator = Arc::new(Coordinator::new(store.directory()));
    let first = coordinator.begin(FIRST).unwrap();
    assert_eq!(
        coordinator.begin(SECOND).err().unwrap().code,
        ErrorCode::Busy
    );
    coordinator.cancel(&store, FIRST).unwrap();
    assert!(first.cancelled.load(Ordering::Acquire));
    assert!(coordinator.snapshot().unwrap().cancelling);
    assert!(coordinator.begin(SECOND).is_err());
    drop(first);
    let second = coordinator.begin(SECOND).unwrap();
    coordinator.cancel(&store, FIRST).unwrap();
    assert!(!second.cancelled.load(Ordering::Acquire));
    assert_eq!(
        coordinator.snapshot().unwrap().operation_id.as_deref(),
        Some(SECOND)
    );
    drop(second);
    assert_eq!(coordinator.snapshot().unwrap().operation_id, None);
}

#[test]
fn unknown_process_record_blocks_generation_but_keeps_local_store_available() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    fs::write(dir.path().join("cli-process.json"), "invalid").unwrap();
    let coordinator = Arc::new(Coordinator::new(store.directory()));
    assert!(coordinator.snapshot().unwrap().blocked.is_some());
    assert_eq!(
        coordinator.begin(FIRST).err().unwrap().code,
        ErrorCode::Busy
    );
    assert!(store.documents().unwrap().is_empty());
}

#[test]
fn cancellation_serializes_before_registration_and_preserves_confirmed_file() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(&dir.path().join("data")).unwrap();
    let path = dir.path().join("document.md");
    fs::write(&path, "original").unwrap();
    let document = store.open_document(&path).unwrap();
    let job = begin_job(&store, &document.id);
    let coordinator = Arc::new(Coordinator::new(store.directory()));
    let guard = coordinator.begin(&job.id).unwrap();
    coordinator.cancel(&store, &job.id).unwrap();
    let response = docreview_core::domain::ai::AiResponse::Rewrite {
        schema_version: 1,
        summary: "Test".into(),
        candidate_markdown: "candidate".into(),
    };
    assert_eq!(
        store.register_rewrite(&job, &response).unwrap_err().code,
        ErrorCode::Cancelled
    );
    assert!(store.task_review(FIRST).unwrap().generating);
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    drop(guard);
    assert!(!store.task_review(FIRST).unwrap().generating);
    assert_eq!(fs::read_to_string(path).unwrap(), "original");
}

fn begin_job(store: &Store, document_id: &str) -> docreview_core::domain::review::ReviewJob {
    store
        .put_task(TaskSnapshot {
            id: FIRST.into(),
            document_id: document_id.into(),
            goal: "Review".into(),
            pinned_rules: String::new(),
            summary: String::new(),
        })
        .unwrap();
    store
        .begin_review_job(BeginReviewJob {
            document_id: document_id.into(),
            task_id: FIRST.into(),
            expected_version: 1,
            selection: ScopeSelection::Whole,
        })
        .unwrap()
}

#[test]
fn normal_shutdown_waits_for_cancelled_worker_and_closes_the_generation_slot() {
    let directory = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(directory.path()).unwrap());
    let coordinator = Arc::new(Coordinator::new(store.directory()));
    let guard = coordinator.begin(FIRST).unwrap();
    let worker = std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while !guard.cancelled.load(Ordering::Acquire) {
            assert!(std::time::Instant::now() < deadline);
            std::thread::yield_now();
        }
        drop(guard);
    });
    coordinator.shutdown(&store).unwrap();
    worker.join().unwrap();
    assert_eq!(coordinator.snapshot().unwrap().operation_id, None);
    assert_eq!(
        coordinator.begin(SECOND).err().unwrap().code,
        ErrorCode::Busy
    );
}
