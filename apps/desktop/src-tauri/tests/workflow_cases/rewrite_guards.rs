use crate::rewrite_world::{CONFIRMED, RewriteWorld, response};
use docreview_core::{domain::error::ErrorCode, storage::runtime::Runtime};
use std::fs;

#[test]
fn generation_locks_apply_select_and_discard_without_touching_file() {
    let world = RewriteWorld::new();
    let job = world.begin();
    let store = &world.world.store;
    assert_eq!(
        store.apply_rewrite(world.request()).unwrap_err().code,
        ErrorCode::Busy
    );
    assert_eq!(
        store.select_rewrite(world.request()).unwrap_err().code,
        ErrorCode::Busy
    );
    assert_eq!(
        store.discard_batch(world.request()).unwrap_err().code,
        ErrorCode::Busy
    );
    store.finish_failed_job(&job, ErrorCode::Cancelled).unwrap();
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), CONFIRMED);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
}

#[test]
fn foreign_document_and_archived_candidate_cannot_be_applied() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let path = world.world.directory.path().join("other.md");
    fs::write(&path, "# 별도 문서\n").unwrap();
    let other = store.open_document(&path).unwrap();
    let mut foreign = world.request();
    foreign.document_id = other.id;
    foreign.expected_head_id = other.version_id;
    assert_eq!(
        store.apply_rewrite(foreign.clone()).unwrap_err().code,
        ErrorCode::StaleBase
    );
    assert_eq!(
        store.discard_batch(foreign).unwrap_err().code,
        ErrorCode::StaleBase
    );
    let job = world.begin();
    store
        .register_rewrite(&job, &response("# 새 후보\n"))
        .unwrap();
    assert_eq!(
        store.apply_rewrite(world.request()).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "# 별도 문서\n");
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), CONFIRMED);
}

#[test]
fn database_failure_and_external_edits_preserve_candidate_and_confirmed_versions() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=ON"))
        .unwrap();
    assert_eq!(
        store.apply_rewrite(world.request()).unwrap_err().code,
        ErrorCode::SaveFailed
    );
    assert_eq!(
        store.discard_batch(world.request()).unwrap_err().code,
        ErrorCode::SaveFailed
    );
    store
        .configure_database_for_test(|db| db.execute_batch("PRAGMA query_only=OFF"))
        .unwrap();
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), CONFIRMED);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    fs::write(&world.world.path, "# 외부 수정 보존\n").unwrap();
    assert_eq!(
        store.apply_rewrite(world.request()).unwrap_err().code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        fs::read_to_string(&world.world.path).unwrap(),
        "# 외부 수정 보존\n"
    );
    assert_eq!(store.snapshot(&world.head.id).unwrap().version, 14);
}

#[test]
fn cancelled_decision_id_cannot_be_reused_for_a_save_or_another_candidate() {
    let world = RewriteWorld::new();
    let request = world.request();
    world.world.store.discard_batch(request.clone()).unwrap();
    assert_eq!(
        world
            .world
            .store
            .apply_rewrite(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    let mut changed = request;
    changed.batch_id = world.world.runtime.id();
    assert_eq!(
        world.world.store.discard_batch(changed).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().version,
        14
    );
}
