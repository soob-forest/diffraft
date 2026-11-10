use crate::{
    grouping::{fixture, prepare},
    world::ReviewWorld,
};
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse},
        annotations::RevisionRequest,
        editor::ScopeSelection,
    },
    storage::{review_jobs::BeginReviewJob, runtime::Runtime},
};

const SOURCE: &str = "이 기능은 불가능합니다.\n\n상태는 안정합니다.\n";
const CHANGES: &[(&str, &str)] = &[("불가능", "가능"), ("안정", "불안정")];

fn v1(w: &mut ReviewWorld, combined: bool) {
    let db = w.world.database();
    db.execute(
        "UPDATE patch_reviews SET policy_version=1,revision=7 WHERE batch_id=?1",
        [&w.batch.id],
    )
    .unwrap();
    if combined {
        db.execute(
            "UPDATE proposals SET group_id=?1 WHERE batch_id=?2",
            rusqlite::params![w.batch.proposals[0].group_id, w.batch.id],
        )
        .unwrap();
    }
    w.batch = w.world.store.review_batch(&w.batch.id).unwrap();
}

#[test]
fn v1_groups_upgrade_once_without_resetting_revision_or_changing_proposals() {
    let mut w = fixture(SOURCE, CHANGES);
    v1(&mut w, true);
    let before = w.batch.clone();
    let stale = w.request(&[0, 1]);
    let request = prepare(&w);
    w.batch = w.world.store.prepare_patch_review(request.clone()).unwrap();
    let meta = w.batch.patch_review.as_ref().unwrap();
    assert_eq!((meta.policy_version, meta.revision), (3, 8));
    assert_ne!(w.batch.proposals[0].group_id, w.batch.proposals[1].group_id);
    for (old, new) in before.proposals.iter().zip(&w.batch.proposals) {
        assert_eq!(
            (&old.id, old.revision, &old.operation),
            (&new.id, new.revision, &new.operation)
        );
    }
    assert!(w.world.store.accept_proposals(stale).is_err());
    assert_eq!(
        serde_json::to_value(&w.batch).unwrap(),
        serde_json::to_value(w.world.store.prepare_patch_review(request).unwrap()).unwrap()
    );
    w.world.store.reject_proposals(w.request(&[1])).unwrap();
    let saved = w.world.store.accept_proposals(w.request(&[0])).unwrap();
    assert_eq!(saved.content, SOURCE.replace("불가능", "가능"));
}

#[test]
fn v1_partial_decisions_and_future_policies_are_not_automatically_changed() {
    for future in [false, true] {
        let mut w = fixture(SOURCE, CHANGES);
        if !future {
            w.world.store.reject_proposals(w.request(&[1])).unwrap();
        }
        v1(&mut w, false);
        if future {
            w.world
                .database()
                .execute(
                    "UPDATE patch_reviews SET policy_version=99 WHERE batch_id=?1",
                    [&w.batch.id],
                )
                .unwrap();
            w.batch = w.world.store.review_batch(&w.batch.id).unwrap();
        }
        assert_eq!(
            serde_json::to_value(&w.batch).unwrap(),
            serde_json::to_value(w.world.store.prepare_patch_review(prepare(&w)).unwrap()).unwrap()
        );
    }
}

#[test]
fn invalid_closing_revision_is_rolled_back_and_valid_quoted_pairs_can_be_accepted() {
    let mut w = fixture(
        "> ```text\n> code\n> ```\n\nplain noise\n",
        &[
            ("```text", "~~~text"),
            ("code\n> ```", "code\n> ~~~"),
            ("plain noise", "plain"),
        ],
    );
    let before = serde_json::to_value(&w.batch).unwrap();
    let p = &w.batch.proposals[1];
    let request = RevisionRequest {
        document_id: w.head.id.clone(),
        batch_id: w.batch.id.clone(),
        proposal_id: p.id.clone(),
        expected_revision: p.revision,
        expected_head_id: w.head.version_id.clone(),
        after: "code\n> ~~~invalid".into(),
        operation_id: w.world.runtime.id(),
    };
    assert!(w.world.store.save_proposal_revision(request).is_err());
    assert_eq!(
        before,
        serde_json::to_value(w.world.store.review_batch(&w.batch.id).unwrap()).unwrap()
    );
    assert!(w.world.store.accept_proposals(w.request(&[0])).is_err());
    w.head = w.world.store.accept_proposals(w.request(&[0, 1])).unwrap();
    assert_eq!(w.head.content, "> ~~~text\n> code\n> ~~~\n\nplain noise\n");
}

#[test]
fn v1_upgrade_rolls_back_then_competing_retries_record_one_transition() {
    let mut w = fixture(SOURCE, CHANGES);
    v1(&mut w, true);
    let before = serde_json::to_value(&w.batch).unwrap();
    let db = w.world.database();
    db.execute_batch("CREATE TRIGGER fail_policy BEFORE UPDATE ON patch_reviews BEGIN SELECT RAISE(ABORT,'synthetic policy failure'); END;").unwrap();
    assert!(w.world.store.prepare_patch_review(prepare(&w)).is_err());
    assert_eq!(
        before,
        serde_json::to_value(w.world.store.review_batch(&w.batch.id).unwrap()).unwrap()
    );
    db.execute_batch("DROP TRIGGER fail_policy;").unwrap();
    let (a, b) = std::thread::scope(|s| {
        let a = s.spawn(|| w.world.store.prepare_patch_review(prepare(&w)).unwrap());
        let b = s.spawn(|| w.world.store.prepare_patch_review(prepare(&w)).unwrap());
        (a.join().unwrap(), b.join().unwrap())
    });
    assert_eq!(
        serde_json::to_value(a).unwrap(),
        serde_json::to_value(b).unwrap()
    );
    let events: Vec<String> = db
        .prepare("SELECT payload FROM decision_events WHERE kind='patch_review_prepare'")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(events.len(), 1);
    let payload: serde_json::Value = serde_json::from_str(&events[0]).unwrap();
    assert_eq!(
        (
            payload["oldPolicyVersion"].as_u64(),
            payload["policyVersion"].as_u64()
        ),
        (Some(1), Some(3))
    );
    assert_eq!(
        (
            payload["oldRevision"].as_u64(),
            payload["revision"].as_u64()
        ),
        (Some(7), Some(8))
    );
}

#[test]
fn unchanged_groups_and_comment_anchors_survive_upgrade_and_restart() {
    use docreview_core::domain::annotations::{AddComment, ReviewSide};
    let mut w = fixture(SOURCE, CHANGES);
    let comment = w
        .world
        .store
        .add_comment(AddComment {
            id: w.world.runtime.id(),
            batch_id: w.batch.id.clone(),
            proposal_id: w.batch.proposals[0].id.clone(),
            expected_revision: 1,
            side: ReviewSide::After,
            from_utf16: 0,
            to_utf16: 1,
            text: "합성 의견 보존".into(),
        })
        .unwrap();
    v1(&mut w, false);
    let ids = w
        .batch
        .proposals
        .iter()
        .map(|p| p.group_id.clone())
        .collect::<Vec<_>>();
    let prepared = w.world.store.prepare_patch_review(prepare(&w)).unwrap();
    assert_eq!(
        ids,
        prepared
            .proposals
            .iter()
            .map(|p| p.group_id.clone())
            .collect::<Vec<_>>()
    );
    let data = w.world.store.directory().to_owned();
    drop(w.world.store);
    let store = docreview_core::storage::Store::open(&data).unwrap();
    assert_eq!(
        serde_json::to_value(prepared).unwrap(),
        serde_json::to_value(store.review_batch(&w.batch.id).unwrap()).unwrap()
    );
    assert_eq!(
        serde_json::to_value(comment).unwrap(),
        serde_json::to_value(&store.review_comments(&w.task).unwrap()[0]).unwrap()
    );
}

#[test]
fn invalid_v1_fence_keeps_old_groups_policy_and_document_unchanged() {
    let mut w = fixture("```text\ncode\n```\n", &[("code\n```", "new code\n```")]);
    v1(&mut w, false);
    let p = &mut w.batch.proposals[0];
    p.operation.after = "new code\n```invalid".into();
    w.world
        .database()
        .execute(
            "UPDATE proposals SET block_anchor=?1 WHERE id=?2",
            rusqlite::params![serde_json::to_string(&p.operation).unwrap(), p.id],
        )
        .unwrap();
    let before = serde_json::to_value(&w.batch).unwrap();
    assert!(w.world.store.prepare_patch_review(prepare(&w)).is_err());
    assert_eq!(
        before,
        serde_json::to_value(w.world.store.review_batch(&w.batch.id).unwrap()).unwrap()
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
}

#[test]
fn invalid_new_result_rolls_back_previous_batch_archival_and_all_new_proposals() {
    let w = fixture("```text\ncode\n```\n", &[("code\n```", "new code\n```")]);
    let before = serde_json::to_value(&w.batch).unwrap();
    let job = w
        .world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: w.head.id.clone(),
            task_id: w.task.clone(),
            expected_version: w.head.version,
            selection: ScopeSelection::Whole,
        })
        .unwrap();
    let response = AiResponse::Patch {
        schema_version: 1,
        summary: "synthetic invalid fence".into(),
        changes: vec![AiChange {
            block_id: w.batch.proposals[0].operation.block_id.clone(),
            before: "code\n```".into(),
            after: "new code\n```invalid".into(),
            reason: "synthetic".into(),
        }],
    };
    assert!(w.world.store.register_patch(&job, &response).is_err());
    assert_eq!(
        before,
        serde_json::to_value(w.world.store.review_batch(&w.batch.id).unwrap()).unwrap()
    );
    let db = w.world.database();
    assert_eq!(
        db.query_row("SELECT count(*) FROM proposal_batches", [], |r| r
            .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM patch_reviews", [], |r| r
            .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        std::fs::read_to_string(&w.world.path).unwrap(),
        w.head.content
    );
}
