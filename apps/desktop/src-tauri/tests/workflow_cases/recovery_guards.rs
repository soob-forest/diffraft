use crate::{rewrite_world::RewriteWorld, world::ReviewWorld};
use docreview_core::{
    domain::{
        document::DocumentStatus,
        error::{AppError, ErrorCode},
        review::{Decision, Validity},
        rewrite::BatchDecisionRequest,
    },
    storage::{Store, models::SaveStage, runtime::Runtime},
};
use std::{fs, sync::Arc};

const INTERRUPTIONS: [SaveStage; 2] = [SaveStage::Prepared, SaveStage::FileReplaced];
const EXTERNAL: &str = "# 외부 수정은 보존\n";

fn interrupt(store: &Store, target: SaveStage) {
    store
        .set_save_observer(Arc::new(move |stage| {
            if stage == target {
                Err(AppError::new(ErrorCode::SaveFailed, "주입된 저장 중단"))
            } else {
                Ok(())
            }
        }))
        .unwrap();
}

fn discard_request(world: &ReviewWorld) -> BatchDecisionRequest {
    BatchDecisionRequest {
        document_id: world.head.id.clone(),
        batch_id: world.batch.id.clone(),
        expected_head_id: world.head.version_id.clone(),
        operation_id: world.world.runtime.id(),
    }
}

#[test]
fn reopening_an_interrupted_approval_preserves_recovery_and_proposals() {
    for stage in INTERRUPTIONS {
        let world = ReviewWorld::new();
        interrupt(&world.world.store, stage);
        assert!(
            world
                .world
                .store
                .accept_proposals(world.request(&[0]))
                .is_err()
        );
        let reopened = world.world.store.open_document(&world.world.path).unwrap();
        assert_eq!(reopened.status, DocumentStatus::RecoveryRequired);
        let batch = world.world.store.review_batch(&world.batch.id).unwrap();
        assert!(
            batch
                .proposals
                .iter()
                .all(|proposal| proposal.decision == Decision::Pending
                    && proposal.validity == Validity::Valid)
        );
        assert_approval_recovery(world, stage);
    }
}

#[test]
fn discarding_an_interrupted_approval_is_rejected_before_any_mutation() {
    for stage in INTERRUPTIONS {
        let world = ReviewWorld::new();
        interrupt(&world.world.store, stage);
        assert!(
            world
                .world
                .store
                .accept_proposals(world.request(&[0]))
                .is_err()
        );
        assert_eq!(
            world
                .world
                .store
                .discard_batch(discard_request(&world))
                .unwrap_err()
                .code,
            ErrorCode::FileConflict
        );
        assert_no_discard(&world.world.store, &world.batch.id);
        assert_approval_recovery(world, stage);
    }
}

fn assert_no_discard(store: &Store, batch: &str) {
    let batch = store.review_batch(batch).unwrap();
    assert_eq!(batch.status, "ACTIVE");
    assert!(
        batch
            .proposals
            .iter()
            .all(|proposal| proposal.decision == Decision::Pending)
    );
}

fn assert_approval_recovery(world: ReviewWorld, stage: SaveStage) {
    let data = world.world.directory.path().join("data");
    drop(world.world.store);
    let store = Store::open(&data).unwrap();
    let head = store.snapshot(&world.head.id).unwrap();
    let committed = stage == SaveStage::FileReplaced;
    assert_eq!(head.version, if committed { 13 } else { 12 });
    assert_eq!(head.status, DocumentStatus::Ready);
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), head.content);
    let batch = store.review_batch(&world.batch.id).unwrap();
    assert_eq!(
        batch.proposals[0].decision,
        if committed {
            Decision::Accepted
        } else {
            Decision::Pending
        }
    );
    assert_eq!(batch.proposals[1].validity, Validity::Valid);
    store.recover().unwrap();
    assert_eq!(
        store.versions(&head.id).unwrap().len(),
        head.version as usize
    );
}

#[test]
fn discarding_an_interrupted_rewrite_is_rejected_and_restart_recovers() {
    for stage in INTERRUPTIONS {
        let world = RewriteWorld::new();
        interrupt(&world.world.store, stage);
        assert!(world.world.store.apply_rewrite(world.request()).is_err());
        assert_eq!(
            world
                .world
                .store
                .discard_batch(world.request())
                .unwrap_err()
                .code,
            ErrorCode::FileConflict
        );
        assert_no_discard(&world.world.store, &world.batch.id);
        assert_rewrite_recovery(world, stage);
    }
}

fn assert_rewrite_recovery(world: RewriteWorld, stage: SaveStage) {
    let data = world.world.directory.path().join("data");
    drop(world.world.store);
    let store = Store::open(&data).unwrap();
    let head = store.snapshot(&world.head.id).unwrap();
    let committed = stage == SaveStage::FileReplaced;
    assert_eq!(head.version, if committed { 15 } else { 14 });
    assert_eq!(head.status, DocumentStatus::Ready);
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        if committed { "APPLIED" } else { "ACTIVE" }
    );
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), head.content);
    store.recover().unwrap();
    assert_eq!(
        store.versions(&head.id).unwrap().len(),
        head.version as usize
    );
}

#[test]
fn prepared_conflict_blocks_discard_until_recovery_classifies_the_journal() {
    let world = RewriteWorld::new();
    let path = world.world.path.clone();
    world
        .world
        .store
        .set_save_observer(Arc::new(move |stage| {
            if stage == SaveStage::BeforeReplace {
                fs::write(&path, EXTERNAL).unwrap();
            }
            Ok(())
        }))
        .unwrap();
    assert_eq!(
        world
            .world
            .store
            .apply_rewrite(world.request())
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().status,
        DocumentStatus::Conflict
    );
    let request = world.request();
    assert_eq!(
        world
            .world
            .store
            .discard_batch(request.clone())
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
    assert_no_discard(&world.world.store, &world.batch.id);
    assert_conflict_can_be_discarded_after_recovery(&world, request);
}

fn assert_conflict_can_be_discarded_after_recovery(
    world: &RewriteWorld,
    request: BatchDecisionRequest,
) {
    world.world.store.recover().unwrap();
    assert_eq!(
        world
            .world
            .store
            .discard_batch(request.clone())
            .unwrap()
            .status,
        "DISCARDED"
    );
    assert_eq!(
        world.world.store.discard_batch(request).unwrap().status,
        "DISCARDED"
    );
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), EXTERNAL);
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().version,
        14
    );
}
