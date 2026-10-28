use crate::rewrite_world::{CONFIRMED, REWRITE, RewriteWorld};
use docreview_core::{
    domain::{
        document::DocumentStatus,
        error::{AppError, ErrorCode},
    },
    storage::{Store, models::SaveStage},
};
use std::{fs, sync::Arc};

#[test]
fn every_interrupted_rewrite_recovers_file_version_and_candidate_atomically() {
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

fn recover_stage(stage: SaveStage) {
    let world = RewriteWorld::new();
    let request = world.request();
    world
        .world
        .store
        .set_save_observer(Arc::new(move |actual| {
            if actual == stage {
                Err(AppError::new(ErrorCode::SaveFailed, "주입된 저장 중단"))
            } else {
                Ok(())
            }
        }))
        .unwrap();
    assert!(world.world.store.apply_rewrite(request.clone()).is_err());
    let database = world.world.database();
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    let (version, events) = assert_recovered(&store, &request, &world.world.path, stage);
    if events == 1 {
        assert_eq!(store.apply_rewrite(request).unwrap().version, 15);
    }
    store.recover().unwrap();
    let count: u32 = database
        .query_row(
            "SELECT COUNT(*) FROM decision_events WHERE kind='rewrite'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, events);
    assert_eq!(
        store.versions(&world.head.id).unwrap().len(),
        version as usize
    );
}

fn assert_recovered(
    store: &Store,
    request: &docreview_core::domain::rewrite::BatchDecisionRequest,
    path: &std::path::Path,
    stage: SaveStage,
) -> (u32, u32) {
    let (version, content, status, events) = match stage {
        SaveStage::FileReplaced | SaveStage::DbCommitted => (15, REWRITE, "APPLIED", 1),
        _ => (14, CONFIRMED, "ACTIVE", 0),
    };
    let head = store.snapshot(&request.document_id).unwrap();
    assert_eq!(head.status, DocumentStatus::Ready);
    assert_eq!((head.version, head.content.as_str()), (version, content));
    assert_eq!(fs::read_to_string(path).unwrap(), content);
    assert_eq!(
        store.review_batch(&request.batch_id).unwrap().status,
        status
    );
    (version, events)
}

#[test]
fn external_edit_at_last_check_is_never_overwritten_or_marked_applied() {
    let world = RewriteWorld::new();
    let request = world.request();
    let path = world.world.path.clone();
    world
        .world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::BeforeReplace {
                fs::write(&path, "# 경합 외부 파일\n").unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world.world.store.apply_rewrite(request).unwrap_err().code,
        ErrorCode::FileConflict
    );
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    assert_eq!(
        fs::read_to_string(&world.world.path).unwrap(),
        "# 경합 외부 파일\n"
    );
    assert_eq!(store.snapshot(&world.head.id).unwrap().version, 14);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
}
