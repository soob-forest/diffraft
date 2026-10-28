use crate::support::{INITIAL_CONTENT, SAVED_CONTENT, World};
use docreview_core::{
    domain::{
        conflict::RecoverySource,
        document::DocumentStatus,
        error::{AppError, ErrorCode},
    },
    storage::models::SaveStage,
};
use std::{fs, sync::Arc};

#[test]
fn compares_unsaved_buffer_to_exact_external_disk_without_writing_either() {
    let world = World::new();
    let external = "\u{feff}# 외부 내용\r\n15분 😀\r\n";
    fs::write(&world.path, external).unwrap();
    let view = world
        .store
        .conflict_comparison(&world.document.id, "앱의 미저장 내용\n")
        .unwrap();
    assert_eq!(view.document.status, DocumentStatus::Conflict);
    assert_eq!(view.document.content, INITIAL_CONTENT);
    assert_eq!(view.before, "앱의 미저장 내용\n");
    assert_eq!(view.after, external);
    assert!(view.disk_hash.is_some());
    assert!(view.disk_error.is_none());
    assert_eq!((view.stats.removed_lines, view.stats.added_lines), (1, 2));
    assert_eq!(fs::read_to_string(&world.path).unwrap(), external);
    assert_eq!(world.store.versions(&world.document.id).unwrap().len(), 1);
}

#[test]
fn missing_or_invalid_utf8_disk_is_a_diagnostic_and_is_never_recreated() {
    let world = World::new();
    fs::remove_file(&world.path).unwrap();
    let view = world
        .store
        .conflict_comparison(&world.document.id, SAVED_CONTENT)
        .unwrap();
    assert!(view.disk_hash.is_none());
    assert!(view.disk_error.unwrap().message.contains("찾을 수"));
    assert!(!world.path.exists());
    fs::write(&world.path, [0xff, 0xfe]).unwrap();
    let view = world
        .store
        .conflict_comparison(&world.document.id, SAVED_CONTENT)
        .unwrap();
    assert!(view.disk_error.unwrap().message.contains("UTF-8"));
    assert_eq!(fs::read(&world.path).unwrap(), [0xff, 0xfe]);
    assert!(
        world
            .store
            .conflict_comparison(&world.document.id, "\0")
            .is_err()
    );
}

#[test]
fn comparison_keeps_prepared_journal_for_recovery_and_loads_its_buffer_on_demand() {
    let world = World::new();
    let request = world.request();
    world
        .store
        .set_save_observer(Arc::new(|stage| {
            if stage == SaveStage::FileReplaced {
                return Err(AppError::new(ErrorCode::SaveFailed, "주입된 중단"));
            }
            Ok(())
        }))
        .unwrap();
    assert!(world.store.save(request.clone()).is_err());
    let view = world
        .store
        .conflict_comparison(&world.document.id, INITIAL_CONTENT)
        .unwrap();
    assert_eq!(view.document.status, DocumentStatus::RecoveryRequired);
    assert_eq!(view.recovery_copies.len(), 1);
    assert_eq!(view.recovery_copies[0].id, request.operation_id);
    assert_eq!(
        world
            .store
            .recovery_copy(
                &world.document.id,
                &request.operation_id,
                RecoverySource::UnfinishedSave
            )
            .unwrap(),
        SAVED_CONTENT
    );
    world.store.recover().unwrap();
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 2);
    assert!(
        world
            .store
            .recovery_copy(
                &world.document.id,
                &request.operation_id,
                RecoverySource::UnfinishedSave
            )
            .is_err()
    );
}
