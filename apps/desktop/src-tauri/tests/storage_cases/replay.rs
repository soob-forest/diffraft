use crate::support::{SAVED_CONTENT, World};
use docreview_core::domain::{document::DocumentStatus, error::ErrorCode};
use std::fs;

#[test]
fn committed_retry_cannot_acknowledge_a_newer_head() {
    let world = World::new();
    let original = world.request();
    let saved = world.store.save(original.clone()).unwrap();
    let mut next = world.request();
    next.expected_version = saved.version;
    next.content = "더 최신의 확정 원문".into();
    let latest = world.store.save(next).unwrap();
    assert_eq!(
        world.store.save(original).unwrap_err().code,
        ErrorCode::StaleBase
    );
    assert_eq!(
        world.store.ensure_current(&latest.id).unwrap().version_id,
        latest.version_id
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), latest.content);
}

#[test]
fn committed_retry_rechecks_external_file_before_acknowledging() {
    let world = World::new();
    let request = world.request();
    world.store.save(request.clone()).unwrap();
    fs::write(&world.path, "外部 파일 변경").unwrap();
    assert_eq!(
        world.store.save(request).unwrap_err().code,
        ErrorCode::FileConflict
    );
    let current = world.store.open_document(&world.path).unwrap();
    assert_eq!(current.status, DocumentStatus::Conflict);
    assert_eq!(current.content, SAVED_CONTENT);
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "外部 파일 변경");
}
