use crate::{
    restoration::request,
    support::{INITIAL_CONTENT, SAVED_CONTENT, World},
};
use docreview_core::{
    domain::{
        document::DocumentStatus,
        error::{AppError, ErrorCode},
    },
    storage::{Store, models::SaveStage},
};
use std::{fs, sync::Arc};

#[test]
fn restore_recovers_all_save_stages_and_commits_its_event_once() {
    for stage in [
        SaveStage::TempWritten,
        SaveStage::Prepared,
        SaveStage::BeforeReplace,
        SaveStage::FileReplaced,
        SaveStage::DbCommitted,
    ] {
        recover_stage(stage);
    }
}

#[test]
fn external_change_immediately_before_restore_replacement_is_preserved() {
    let world = World::new();
    let edited = world.store.save(world.request()).unwrap();
    let path = world.path.clone();
    world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::BeforeReplace {
                fs::write(&path, "外部 한글 😀\r\n").unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world
            .store
            .restore_version(request(&world, &edited.version_id))
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(store.snapshot(&edited.id).unwrap().version, 2);
    assert_eq!(fs::read_to_string(&world.path).unwrap(), "外部 한글 😀\r\n");
}

fn recover_stage(stage: SaveStage) {
    let world = World::new();
    let edited = world.store.save(world.request()).unwrap();
    let request = request(&world, &edited.version_id);
    world
        .store
        .set_save_observer(Arc::new(move |actual| {
            if actual == stage {
                Err(AppError::new(ErrorCode::SaveFailed, "주입된 중단"))
            } else {
                Ok(())
            }
        }))
        .unwrap();
    assert!(world.store.restore_version(request.clone()).is_err());
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    let (expected_version, expected_content) = match stage {
        SaveStage::FileReplaced | SaveStage::DbCommitted => (3, INITIAL_CONTENT),
        _ => (2, SAVED_CONTENT),
    };
    let head = store.snapshot(&edited.id).unwrap();
    assert_eq!(head.status, DocumentStatus::Ready);
    assert_eq!(head.version, expected_version);
    assert_eq!(head.content, expected_content);
    assert_eq!(fs::read_to_string(&world.path).unwrap(), head.content);
    if expected_version == 3 {
        assert_eq!(store.restore_version(request).unwrap().version, 3);
    }
    store.recover().unwrap();
    assert_eq!(
        store.versions(&edited.id).unwrap().len(),
        head.version as usize
    );
}
