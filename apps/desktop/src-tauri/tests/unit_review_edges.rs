#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::{
    domain::{
        ai::AiResponse,
        error::{AppError, ErrorCode},
        review::Decision,
        rewrite::RewriteRequest,
    },
    storage::{Store, models::SaveStage, runtime::Runtime},
};
use fixture::UnitWorld;
use std::{
    fs,
    sync::{Arc, Barrier},
    thread,
};

#[test]
fn concurrent_starts_and_decisions_are_serialized_without_duplicate_plans() {
    let w = UnitWorld::source();
    let requests = [w.start_request(), w.start_request()];
    let barrier = Barrier::new(2);
    let plans = thread::scope(|scope| {
        requests
            .into_iter()
            .map(|request| {
                let barrier = &barrier;
                let store = &w.world.store;
                scope.spawn(move || {
                    barrier.wait();
                    store
                        .start_rewrite_review(request)
                        .unwrap()
                        .review_plan
                        .unwrap()
                        .id
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_eq!(plans[0], plans[1]);
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT COUNT(*) FROM review_plans", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
}

#[test]
fn concurrent_decisions_on_same_head_save_exactly_once() {
    let w = UnitWorld::source();
    w.start();
    let requests = [w.decision(0), w.decision(1)];
    let barrier = Barrier::new(2);
    let results = thread::scope(|scope| {
        requests
            .into_iter()
            .map(|request| {
                let barrier = &barrier;
                let store = &w.world.store;
                scope.spawn(move || {
                    barrier.wait();
                    store.accept_proposals(request).is_ok()
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert_eq!(results.iter().filter(|ok| **ok).count(), 1);
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version + 1
    );
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT COUNT(*) FROM review_plans", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        fs::read_to_string(&w.world.path).unwrap(),
        w.world.store.snapshot(&w.head.id).unwrap().content
    );
}

#[test]
fn failed_plan_registration_rolls_back_every_row_and_preserves_whole_candidate() {
    let w = UnitWorld::source();
    w.world.store.configure_database_for_test(|db|db.execute_batch("CREATE TRIGGER deny_unit BEFORE INSERT ON review_units BEGIN SELECT RAISE(ABORT,'fixture'); END;")).unwrap();
    assert!(
        w.world
            .store
            .start_rewrite_review(w.start_request())
            .is_err()
    );
    assert!(!w.current().is_unit_review());
    assert_eq!(
        w.world
            .database()
            .query_row("SELECT COUNT(*) FROM review_plans", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        0
    );
    assert_eq!(fs::read_to_string(&w.world.path).unwrap(), w.head.content);
}

#[test]
fn original_candidate_is_read_only_and_preserves_all_processed_unit_targets() {
    let w = UnitWorld::source();
    w.start();
    w.world.store.accept_proposals(w.decision(0)).unwrap();
    w.world.store.reject_proposals(w.decision(1)).unwrap();
    let original = w
        .world
        .store
        .original_rewrite_projection(&w.batch.id)
        .unwrap();
    assert_eq!(original.before, w.head.content);
    assert_eq!(original.after, w.batch.candidate_markdown.unwrap());
    assert_eq!(original.groups.len(), 2);
    assert_eq!(original.batch.proposals[1].decision, Decision::Rejected);
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().version,
        w.head.version + 1
    );
}

fn rewrite_request(w: &UnitWorld) -> RewriteRequest {
    RewriteRequest {
        model: docreview_core::domain::model::ModelSelection::CliDefault.into(),
        document_id: w.head.id.clone(),
        task_id: w.task.clone(),
        expected_head_id: w.world.store.snapshot(&w.head.id).unwrap().version_id,
        expected_active_batch_id: Some(w.batch.id.clone()),
        reference_batch_id: None,
        archive_patch: true,
        instruction: "새 요청".into(),
        operation_id: w.world.runtime.id(),
        retry_of: None,
    }
}

#[test]
fn followup_carries_opinion_and_archives_old_review_only_after_success() {
    let w = UnitWorld::source();
    w.start();
    w.world
        .store
        .add_unit_comment(w.comment(1, "수치는 유지해 주세요."))
        .unwrap();
    let job = w.world.store.begin_rewrite(rewrite_request(&w)).unwrap();
    let context: serde_json::Value =
        serde_json::from_str(&w.world.store.rewrite_context(&job).unwrap()).unwrap();
    assert_eq!(
        context["unitComments"][0]["comment"]["text"],
        "수치는 유지해 주세요."
    );
    assert_eq!(context["unitComments"][0]["target"]["number"], 2);
    assert_eq!(w.current().status, "ACTIVE");
    w.world
        .store
        .finish_failed_job(&job, ErrorCode::Cancelled)
        .unwrap();
    assert_eq!(w.current().status, "ACTIVE");
    let job = w.world.store.begin_rewrite(rewrite_request(&w)).unwrap();
    w.world
        .store
        .register_rewrite(
            &job,
            &AiResponse::Rewrite {
                schema_version: 1,
                summary: "새 후보".into(),
                candidate_markdown: "새 문서\n".into(),
            },
        )
        .unwrap();
    assert_eq!(w.current().status, "ARCHIVED");
    assert!(
        w.world
            .store
            .add_unit_comment(w.comment(0, "늦은 의견"))
            .is_err()
    );
}

#[test]
fn interrupted_unit_approval_recovers_file_and_current_round_at_every_save_stage() {
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
    let w = UnitWorld::source();
    w.start();
    w.world.store.reject_proposals(w.decision(0)).unwrap();
    w.world.store.reopen_unit_review(w.reopen(0)).unwrap();
    let request = w.decision(0);
    inject_failure(&w, stage);
    assert!(w.world.store.accept_proposals(request.clone()).is_err());
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    let store = Store::open(&data).unwrap();
    let committed = matches!(stage, SaveStage::FileReplaced | SaveStage::DbCommitted);
    let head = store.snapshot(&w.head.id).unwrap();
    assert_eq!(head.version, w.head.version + u32::from(committed));
    let batch = store.review_batch(&w.batch.id).unwrap();
    assert_eq!(batch.review_units[0].review_revision, 2);
    assert_eq!(
        batch.proposals[0].decision,
        if committed {
            Decision::Accepted
        } else {
            Decision::Pending
        }
    );
    assert_original_rejected(&store, &batch);
    assert_eq!(fs::read_to_string(&w.world.path).unwrap(), head.content);
    if committed {
        assert_eq!(
            store.accept_proposals(request).unwrap().version,
            head.version
        );
    }
    store.recover().unwrap();
}

fn inject_failure(w: &UnitWorld, stage: SaveStage) {
    w.world
        .store
        .set_save_observer(Arc::new(move |actual| {
            if actual == stage {
                Err(AppError::new(ErrorCode::SaveFailed, "주입된 중단"))
            } else {
                Ok(())
            }
        }))
        .unwrap();
}

fn assert_original_rejected(store: &Store, batch: &docreview_core::domain::review::ReviewBatch) {
    assert_eq!(
        store
            .proposal_revision(&batch.id, &batch.proposals[0].id, 1)
            .unwrap()
            .decision,
        Decision::Rejected
    );
}
