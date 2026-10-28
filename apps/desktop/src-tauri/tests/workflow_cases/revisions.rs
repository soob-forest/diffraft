use crate::{
    comments::{comment_request, d03, revision_request},
    world::{BASE, CANDIDATE, ReviewWorld},
};
use docreview_core::{
    domain::{
        annotations::ReviewSide,
        error::ErrorCode,
        review::{Decision, ProposalRevision},
    },
    storage::Store,
};

const REVISED: &str = "여행자는 준비물과 다음 여행 계획을 여행 기록에 남깁니다.";

#[test]
fn direct_candidate_revision_persists_without_changing_the_file() {
    let world = ReviewWorld::new();
    assert_eq!(
        world
            .world
            .store
            .review_projection(&world.batch.id, &world.head.version_id)
            .unwrap()
            .after,
        CANDIDATE
    );
    let request = revision_request(&world, REVISED);
    let batch = world
        .world
        .store
        .save_proposal_revision(request.clone())
        .unwrap();
    assert_eq!(d03(&batch).revision, 2);
    assert_eq!(d03(&batch).decision, Decision::Pending);
    assert_eq!(
        d03(&world.world.store.save_proposal_revision(request).unwrap()).revision,
        2
    );
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
    drop(world.world.store);
    let store = Store::open(&world.world.directory.path().join("data")).unwrap();
    assert_eq!(
        d03(&store.review_batch(&world.batch.id).unwrap())
            .operation
            .after,
        REVISED
    );
    assert_eq!(store.snapshot(&world.head.id).unwrap().version, 12);
}

#[test]
fn v12_partial_reject_revision_and_accept_produce_exact_v14() {
    let mut world = ReviewWorld::new();
    world
        .world
        .store
        .reject_proposals(world.request(&[1]))
        .unwrap();
    world.head = world
        .world
        .store
        .accept_proposals(world.request(&[0]))
        .unwrap();
    let batch = world
        .world
        .store
        .save_proposal_revision(revision_request(&world, REVISED))
        .unwrap();
    let mut request = world.request(&[2]);
    request.proposals = vec![ProposalRevision {
        id: d03(&batch).id.clone(),
        revision: 2,
    }];
    let head = world.world.store.accept_proposals(request).unwrap();
    assert_eq!(head.version, 14);
    assert_eq!(
        head.content,
        include_str!("../../../../../docs/examples/confirmed_v14.md")
    );
    assert_eq!(
        std::fs::read_to_string(&world.world.path).unwrap(),
        head.content
    );
}

#[test]
fn invalid_or_database_failed_revision_keeps_previous_candidate_and_comments() {
    let world = ReviewWorld::new();
    world
        .world
        .store
        .add_comment(comment_request(&world, ReviewSide::After))
        .unwrap();
    for after in ["\0", &world.batch.proposals[2].operation.before] {
        assert!(
            world
                .world
                .store
                .save_proposal_revision(revision_request(&world, after))
                .is_err()
        );
    }
    world
        .world
        .store
        .configure_database_for_test(|db| {
            let pages: u32 = db.pragma_query_value(None, "page_count", |row| row.get(0))?;
            db.pragma_update(None, "max_page_count", pages)
        })
        .unwrap();
    let error = world
        .world
        .store
        .save_proposal_revision(revision_request(&world, &"큰 후보 ".repeat(10000)))
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::SaveFailed);
    assert_eq!(
        d03(&world.world.store.review_batch(&world.batch.id).unwrap()).revision,
        1
    );
    assert_eq!(
        world.world.store.review_comments(&world.task).unwrap()[0].status,
        "OPEN"
    );
    assert_eq!(std::fs::read_to_string(&world.world.path).unwrap(), BASE);
}
