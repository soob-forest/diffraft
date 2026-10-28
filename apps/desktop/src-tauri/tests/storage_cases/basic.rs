use crate::support::{INITIAL_CONTENT, SAVED_CONTENT, World};
use docreview_core::{
    domain::{MAX_DOCUMENT_BYTES, error::ErrorCode},
    storage::{Store, files::content_hash},
};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    sync::{Arc, Barrier, atomic::Ordering},
    thread,
};

#[test]
fn imports_without_changes_and_preserves_utf8_bom_crlf_and_permissions() {
    let world = World::new();
    fs::set_permissions(&world.path, fs::Permissions::from_mode(0o640)).unwrap();
    assert_eq!(world.document.content, INITIAL_CONTENT);
    assert_eq!(fs::read(&world.path).unwrap(), INITIAL_CONTENT.as_bytes());
    let saved = world.store.save(world.request()).unwrap();
    assert_eq!(saved.version, 2);
    assert_eq!(saved.content, SAVED_CONTENT);
    assert_eq!(fs::read(&world.path).unwrap(), SAVED_CONTENT.as_bytes());
    assert_eq!(
        fs::metadata(&world.path).unwrap().permissions().mode() & 0o777,
        0o640
    );
    assert_eq!(
        world.store.version_content(&saved.id, 1).unwrap(),
        INITIAL_CONTENT
    );
    assert_eq!(world.store.open_document(&world.path).unwrap().id, saved.id);
    assert_eq!(world.store.documents().unwrap().len(), 1);
}

#[test]
fn sha256_is_exact_and_old_versions_are_immutable() {
    assert_eq!(
        content_hash("abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert_ne!(content_hash("a\r\n"), content_hash("a\n"));
    let world = World::new();
    assert!(
        world
            .database()
            .execute("UPDATE versions SET content_utf8='changed'", [])
            .is_err()
    );
    assert!(
        world
            .database()
            .execute("DELETE FROM versions", [])
            .is_err()
    );
}

#[test]
fn duplicate_operation_is_idempotent_but_cannot_change_payload() {
    let world = World::new();
    let request = world.request();
    let first = world.store.save(request.clone()).unwrap();
    let second = world.store.save(request.clone()).unwrap();
    assert_eq!(first.version_id, second.version_id);
    assert_eq!(world.store.versions(&first.id).unwrap().len(), 2);
    let mut changed = request;
    changed.content = "different".to_owned();
    assert_eq!(
        world.store.save(changed).unwrap_err().code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn stale_save_and_two_competing_writers_do_not_overwrite() {
    let world = World::new();
    let first = world.request();
    let second = world.request();
    let barrier = Arc::new(Barrier::new(2));
    let store = Arc::new(world.store);
    let handles: Vec<_> = [first, second]
        .into_iter()
        .map(|request| {
            let store = store.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                store.save(request)
            })
        })
        .collect();
    let results: Vec<_> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .find_map(|result| result.as_ref().err())
            .unwrap()
            .code,
        ErrorCode::StaleBase
    );
    assert_eq!(fs::read_to_string(world.path).unwrap(), SAVED_CONTENT);
}

#[test]
fn writer_lock_rejects_second_instance() {
    let world = World::new();
    assert!(
        matches!(Store::open(&world.directory.path().join("data")), Err(error) if error.code == ErrorCode::Busy)
    );
}

#[test]
fn rejects_oversize_invalid_encoding_symlink_and_invalid_ids() {
    let world = World::new();
    let bad = world.directory.path().join("bad.md");
    fs::write(&bad, [0xff, 0xfe]).unwrap();
    assert_eq!(
        world.store.open_document(&bad).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    fs::write(&bad, vec![b'a'; MAX_DOCUMENT_BYTES + 1]).unwrap();
    assert_eq!(
        world.store.open_document(&bad).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    let link = world.directory.path().join("link.md");
    symlink(&world.path, &link).unwrap();
    assert_eq!(
        world.store.open_document(&link).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    let mut request = world.request();
    request.operation_id = "not-a-uuid".to_owned();
    assert_eq!(
        world.store.save(request).unwrap_err().code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn readonly_file_is_not_replaced_even_when_parent_is_writable() {
    let world = World::new();
    fs::set_permissions(&world.path, fs::Permissions::from_mode(0o400)).unwrap();
    let result = world.store.save(world.request());
    assert!(matches!(result, Err(error) if error.code == ErrorCode::SaveFailed));
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
}

#[test]
fn sequence_survives_clock_going_backwards() {
    let world = World::new();
    let saved = world.store.save(world.request()).unwrap();
    world.runtime.now.store(1, Ordering::SeqCst);
    let mut request = world.request();
    request.expected_version = saved.version;
    request.content = "next".to_owned();
    world.store.save(request).unwrap();
    let sequence: u32 = world
        .database()
        .query_row("SELECT MAX(seq) FROM decision_events", [], |row| row.get(0))
        .unwrap();
    assert_eq!(sequence, 2);
}

#[test]
fn reopening_registered_path_reports_external_change_immediately() {
    let world = World::new();
    fs::write(&world.path, "외부 변경").unwrap();
    let reopened = world.store.open_document(&world.path).unwrap();
    assert_eq!(
        reopened.status,
        docreview_core::domain::document::DocumentStatus::Conflict
    );
    assert_eq!(reopened.content, INITIAL_CONTENT);
}
