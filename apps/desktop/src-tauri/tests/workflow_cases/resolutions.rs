use crate::support::{INITIAL_CONTENT, World};
use docreview_core::{
    domain::{
        conflict::{RecoverySource, ResolutionChoice, ResolutionRequest},
        document::DocumentStatus,
        error::{AppError, ErrorCode},
    },
    storage::{
        Store,
        files::content_hash,
        models::{SaveReason, SaveStage},
        runtime::Runtime,
    },
};
use std::{
    fs,
    os::unix::fs::{MetadataExt, PermissionsExt},
    sync::Arc,
};

const EXTERNAL: &str = "\u{feff}외부 내용 😀\r\n";
const APP_BUFFER: &str = "보존할 미저장 앱 내용\r\n";
const MERGED: &str = "사용자가 통합한 내용 😀\r\n";

pub fn request(world: &World, choice: ResolutionChoice) -> ResolutionRequest {
    fs::write(&world.path, EXTERNAL).unwrap();
    ResolutionRequest {
        document_id: world.document.id.clone(),
        expected_head_id: world.document.version_id.clone(),
        expected_disk_hash: content_hash(EXTERNAL),
        app_content: APP_BUFFER.into(),
        operation_id: world.runtime.id(),
        choice,
    }
}

#[test]
fn external_adoption_never_replaces_readonly_file_and_preserves_app_buffer() {
    let world = World::new();
    let request = request(&world, ResolutionChoice::External);
    fs::set_permissions(&world.path, fs::Permissions::from_mode(0o444)).unwrap();
    let inode = fs::metadata(&world.path).unwrap().ino();
    let head = world.store.resolve_conflict(request.clone()).unwrap();
    assert_eq!(head.content, EXTERNAL);
    assert_eq!((head.version, head.status), (2, DocumentStatus::Ready));
    assert_eq!(fs::metadata(&world.path).unwrap().ino(), inode);
    assert_eq!(
        world
            .store
            .recovery_copy(&head.id, &request.operation_id, RecoverySource::AppBuffer)
            .unwrap(),
        APP_BUFFER
    );
    assert_eq!(world.store.resolve_conflict(request).unwrap().version, 2);
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(store.version_content(&head.id, 1).unwrap(), INITIAL_CONTENT);
    assert_eq!(store.snapshot(&head.id).unwrap().content, EXTERNAL);
}

#[test]
fn manual_merge_checks_external_hash_instead_of_old_database_hash() {
    let world = World::new();
    let request = request(&world, ResolutionChoice::Merge(MERGED.into()));
    let head = world.store.resolve_conflict(request.clone()).unwrap();
    assert_eq!(fs::read_to_string(&world.path).unwrap(), MERGED);
    assert_eq!(head.content, MERGED);
    assert_eq!(head.version, 2);
    let mut changed = request.clone();
    changed.app_content.push('x');
    assert_eq!(
        world.store.resolve_conflict(changed).unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_eq!(world.store.resolve_conflict(request).unwrap().version, 2);
}

#[test]
fn changed_external_hash_and_deleted_file_cannot_be_overwritten() {
    let world = World::new();
    let request = request(&world, ResolutionChoice::Merge(MERGED.into()));
    fs::write(&world.path, "더 최근 외부 수정").unwrap();
    assert_eq!(
        world
            .store
            .resolve_conflict(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        fs::read_to_string(&world.path).unwrap(),
        "더 최근 외부 수정"
    );
    fs::remove_file(&world.path).unwrap();
    assert!(world.store.resolve_conflict(request).is_err());
    assert!(!world.path.exists());
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 1);
}

#[test]
fn failure_to_preserve_app_buffer_never_touches_disk_or_head() {
    let world = World::new();
    let mut request = request(&world, ResolutionChoice::External);
    request.app_content = "x".repeat(1024 * 1024);
    world
        .store
        .configure_database_for_test(|db| {
            let pages: u32 = db.pragma_query_value(None, "page_count", |row| row.get(0))?;
            db.pragma_update(None, "max_page_count", pages)
        })
        .unwrap();
    assert_eq!(
        world.store.resolve_conflict(request).unwrap_err().code,
        ErrorCode::SaveFailed
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), EXTERNAL);
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 1);
}

#[test]
fn interrupted_resolution_keeps_original_app_buffer_and_distinct_merged_payload() {
    let world = World::new();
    let request = request(&world, ResolutionChoice::Merge(MERGED.into()));
    world
        .store
        .set_save_observer(Arc::new(|stage| {
            if stage == SaveStage::Prepared {
                return Err(AppError::new(ErrorCode::SaveFailed, "중단"));
            }
            Ok(())
        }))
        .unwrap();
    assert!(world.store.resolve_conflict(request.clone()).is_err());
    let view = world
        .store
        .conflict_comparison(&world.document.id, APP_BUFFER)
        .unwrap();
    let saved = view
        .recovery_copies
        .iter()
        .find(|copy| copy.source == RecoverySource::UnfinishedSave)
        .unwrap();
    assert_eq!(
        world
            .store
            .recovery_copy(&world.document.id, &saved.id, saved.source)
            .unwrap(),
        MERGED
    );
}

#[test]
fn old_save_entry_point_cannot_bypass_explicit_resolution() {
    let world = World::new();
    for reason in [SaveReason::External, SaveReason::Merge] {
        let mut request = world.request();
        request.reason = reason;
        assert_eq!(
            world.store.save(request).unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }
    assert_eq!(fs::read_to_string(&world.path).unwrap(), INITIAL_CONTENT);
}
