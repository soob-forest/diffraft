use crate::support::{INITIAL_CONTENT, SAVED_CONTENT, World};
use docreview_core::{
    domain::{conflict::RecoverySource, conflict_api::BufferCopyRequest},
    storage::{Store, runtime::Runtime},
};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
};

#[test]
fn missing_file_buffer_copy_preserves_bytes_and_reopens_without_changing_head() {
    let world = World::new();
    fs::remove_file(&world.path).unwrap();
    let request = BufferCopyRequest {
        document_id: world.document.id.clone(),
        operation_id: world.runtime.id(),
        content: SAVED_CONTENT.into(),
    };
    let copy = world.directory.path().join("copy.md");
    world.store.save_buffer_copy(&request, &copy).unwrap();
    assert_eq!(fs::read_to_string(&copy).unwrap(), SAVED_CONTENT);
    assert_eq!(
        fs::metadata(&copy).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert!(!world.path.exists());
    assert_eq!(
        world.store.snapshot(&request.document_id).unwrap().content,
        INITIAL_CONTENT
    );
    drop(world.store);
    let reopened = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(
        reopened
            .recovery_copy(
                &request.document_id,
                &request.operation_id,
                RecoverySource::AppBuffer
            )
            .unwrap(),
        SAVED_CONTENT
    );
    assert_eq!(reopened.versions(&request.document_id).unwrap().len(), 1);
}

#[test]
fn copies_never_replace_existing_files_symlinks_or_accept_invalid_content() {
    let world = World::new();
    let request = BufferCopyRequest {
        document_id: world.document.id.clone(),
        operation_id: world.runtime.id(),
        content: SAVED_CONTENT.into(),
    };
    assert!(world.store.save_buffer_copy(&request, &world.path).is_err());
    let link = world.directory.path().join("link.md");
    symlink(&world.path, &link).unwrap();
    assert!(world.store.save_buffer_copy(&request, &link).is_err());
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
    let invalid = BufferCopyRequest {
        content: "\0".into(),
        ..request
    };
    let copy = world.directory.path().join("copy.md");
    assert!(world.store.save_buffer_copy(&invalid, &copy).is_err());
    assert!(!copy.exists());
}

#[test]
fn database_failure_prevents_copy_and_changed_replay_cannot_overwrite_snapshot() {
    let world = World::new();
    let request = BufferCopyRequest {
        document_id: world.document.id.clone(),
        operation_id: world.runtime.id(),
        content: SAVED_CONTENT.into(),
    };
    let copy = world.directory.path().join("copy.md");
    world.store.save_buffer_copy(&request, &copy).unwrap();
    let changed = BufferCopyRequest {
        content: "변경".into(),
        ..request.clone()
    };
    let second = world.directory.path().join("second.md");
    assert!(world.store.save_buffer_copy(&changed, &second).is_err());
    assert!(!second.exists());
    world
        .store
        .configure_database_for_test(|connection| connection.execute_batch("PRAGMA query_only=ON"))
        .unwrap();
    let next = BufferCopyRequest {
        operation_id: world.runtime.id(),
        ..request
    };
    assert!(world.store.save_buffer_copy(&next, &second).is_err());
    assert!(!second.exists());
}
