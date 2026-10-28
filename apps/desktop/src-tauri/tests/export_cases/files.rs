use crate::{
    request,
    support::{INITIAL_CONTENT, World},
};
use docreview_core::{
    domain::{
        error::ErrorCode,
        export::{ExportFileKind, ExportFileRequest},
    },
    storage::export_files::ExportDestination,
};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
};

#[test]
fn copy_preserves_bytes_permissions_source_and_binding() {
    let world = World::new();
    let path = world.directory.path().join("copy.md");
    let destination = ExportDestination::selected(&path).unwrap();
    let saved = world
        .store
        .export_file(
            &ExportFileRequest {
                snapshot: request(&world.document),
                kind: ExportFileKind::Copy,
            },
            &destination,
        )
        .unwrap();
    assert_eq!(fs::read(&path).unwrap(), INITIAL_CONTENT.as_bytes());
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(saved.document.path, world.document.path);
    assert_eq!(saved.document.version_id, world.document.version_id);
    assert_eq!(fs::read(&world.path).unwrap(), INITIAL_CONTENT.as_bytes());
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 1);
}

#[test]
fn authorized_existing_file_is_replaced_but_later_changes_are_preserved() {
    let world = World::new();
    let path = world.directory.path().join("copy.md");
    fs::write(&path, "사전 내용").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let destination = ExportDestination::selected(&path).unwrap();
    let action = ExportFileRequest {
        snapshot: request(&world.document),
        kind: ExportFileKind::Copy,
    };
    world.store.export_file(&action, &destination).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), INITIAL_CONTENT);
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o640
    );
    let destination = ExportDestination::selected(&path).unwrap();
    fs::write(&path, "선택 이후 외부 편집").unwrap();
    assert_eq!(
        world
            .store
            .export_file(&action, &destination)
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "선택 이후 외부 편집");
}

#[test]
fn links_new_file_races_and_registered_documents_are_not_overwritten() {
    let world = World::new();
    let path = world.directory.path().join("link.md");
    symlink(&world.path, &path).unwrap();
    assert!(ExportDestination::selected(&path).is_err());
    let action = ExportFileRequest {
        snapshot: request(&world.document),
        kind: ExportFileKind::Copy,
    };
    let original = ExportDestination::selected(&world.path).unwrap();
    assert_eq!(
        world
            .store
            .export_file(&action, &original)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    let path = world.directory.path().join("new.md");
    let destination = ExportDestination::selected(&path).unwrap();
    fs::write(&path, "새 외부 파일").unwrap();
    assert!(world.store.export_file(&action, &destination).is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "새 외부 파일");
    world.store.open_document(&path).unwrap();
    let registered = ExportDestination::selected(&path).unwrap();
    assert_eq!(
        world
            .store
            .export_file(&action, &registered)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn stale_head_external_source_and_readonly_target_do_not_export() {
    let world = World::new();
    let path = world.directory.path().join("copy.md");
    let destination = ExportDestination::selected(&path).unwrap();
    let mut action = ExportFileRequest {
        snapshot: request(&world.document),
        kind: ExportFileKind::Copy,
    };
    let saved = world.store.save(world.request()).unwrap();
    assert_eq!(
        world
            .store
            .export_file(&action, &destination)
            .unwrap_err()
            .code,
        ErrorCode::StaleBase
    );
    assert!(!path.exists());
    action.snapshot = request(&saved);
    fs::write(&path, "읽기 전용").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o400)).unwrap();
    let destination = ExportDestination::selected(&path).unwrap();
    assert_eq!(
        world
            .store
            .export_file(&action, &destination)
            .unwrap_err()
            .code,
        ErrorCode::SaveFailed
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "읽기 전용");
    fs::write(&world.path, "외부 원문").unwrap();
    assert_eq!(
        world
            .store
            .export_snapshot(&action.snapshot)
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
}
