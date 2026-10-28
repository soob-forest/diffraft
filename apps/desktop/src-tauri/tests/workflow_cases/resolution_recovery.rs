use crate::{resolutions::request, support::World};
use docreview_core::{
    domain::{
        conflict::{RecoverySource, ResolutionChoice},
        document::DocumentStatus,
        error::{AppError, ErrorCode},
    },
    storage::{Store, models::SaveStage},
};
use std::{fs, sync::Arc};

fn interrupt_at(world: &World, target: SaveStage) {
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == target {
                return Err(AppError::new(ErrorCode::SaveFailed, "주입된 중단"));
            }
            Ok(())
        }))
        .unwrap();
}

#[test]
fn merge_before_replace_aborts_but_retains_external_conflict_and_both_app_drafts() {
    let world = World::new();
    let request = request(&world, ResolutionChoice::Merge("통합 편집 초안\n".into()));
    let external = fs::read_to_string(&world.path).unwrap();
    interrupt_at(&world, SaveStage::Prepared);
    assert!(world.store.resolve_conflict(request.clone()).is_err());
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    let head = store.snapshot(&world.document.id).unwrap();
    assert_eq!((head.version, head.status), (1, DocumentStatus::Conflict));
    assert_eq!(fs::read_to_string(&world.path).unwrap(), external);
    assert_eq!(
        store
            .recovery_copy(&head.id, &request.operation_id, RecoverySource::AppBuffer)
            .unwrap(),
        request.app_content
    );
    assert_eq!(
        store
            .recovery_copy(
                &head.id,
                &request.operation_id,
                RecoverySource::UnfinishedSave
            )
            .unwrap(),
        "통합 편집 초안\n"
    );
}

#[test]
fn external_adoption_and_merge_after_replace_recover_once() {
    for (choice, stage) in [
        (ResolutionChoice::External, SaveStage::Prepared),
        (ResolutionChoice::External, SaveStage::BeforeReplace),
        (
            ResolutionChoice::Merge("통합 완료\n".into()),
            SaveStage::FileReplaced,
        ),
    ] {
        let world = World::new();
        let request = request(&world, choice);
        interrupt_at(&world, stage);
        assert!(world.store.resolve_conflict(request.clone()).is_err());
        drop(world.store);
        let store = Store::open(&world.directory.path().join("data")).unwrap();
        let head = store.snapshot(&world.document.id).unwrap();
        assert_eq!((head.version, head.status), (2, DocumentStatus::Ready));
        assert_eq!(head.content, fs::read_to_string(&world.path).unwrap());
        assert_eq!(store.resolve_conflict(request).unwrap().version, 2);
        store.recover().unwrap();
        assert_eq!(store.versions(&head.id).unwrap().len(), 2);
    }
}

#[test]
fn another_external_edit_during_resolution_never_gets_overwritten() {
    let world = World::new();
    let request = request(&world, ResolutionChoice::Merge("수동 통합\n".into()));
    let path = world.path.clone();
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::BeforeReplace {
                fs::write(&path, "최종 외부 변경\n").unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world
            .store
            .resolve_conflict(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "최종 외부 변경\n");
    assert_eq!(store.snapshot(&world.document.id).unwrap().version, 1);
    assert_eq!(
        store
            .recovery_copy(
                &world.document.id,
                &request.operation_id,
                RecoverySource::UnfinishedSave
            )
            .unwrap(),
        "수동 통합\n"
    );
}
