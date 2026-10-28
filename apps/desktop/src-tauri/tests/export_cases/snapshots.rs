use crate::{
    request,
    world::{BASE, CANDIDATE, ReviewWorld},
};
use docreview_core::{
    domain::{
        annotations::{AddComment, ReviewSide},
        error::ErrorCode,
    },
    storage::runtime::Runtime,
};

#[test]
fn snapshot_contains_only_confirmed_head_and_counts_pending_groups() {
    let fixture = ReviewWorld::new();
    add_private_metadata(&fixture);
    assert_excluded_metadata(&fixture);
    fixture
        .world
        .store
        .reject_proposals(fixture.request(&[1]))
        .unwrap();
    assert_eq!(
        fixture
            .world
            .store
            .export_snapshot(&request(&fixture.head))
            .unwrap()
            .pending_groups,
        2
    );
    let accepted = fixture
        .world
        .store
        .accept_proposals(fixture.request(&[0]))
        .unwrap();
    assert_eq!(
        fixture
            .world
            .store
            .export_snapshot(&request(&fixture.head))
            .unwrap_err()
            .code,
        ErrorCode::StaleBase
    );
    let snapshot = fixture
        .world
        .store
        .export_snapshot(&request(&accepted))
        .unwrap();
    assert_eq!(snapshot.document.content, accepted.content);
    assert_eq!(snapshot.pending_groups, 1);
}

fn add_private_metadata(fixture: &ReviewWorld) {
    let proposal = &fixture.batch.proposals[0];
    fixture
        .world
        .store
        .add_comment(AddComment {
            id: fixture.world.runtime.id(),
            batch_id: fixture.batch.id.clone(),
            proposal_id: proposal.id.clone(),
            expected_revision: 1,
            side: ReviewSide::After,
            from_utf16: 0,
            to_utf16: 1,
            text: "내보내면 안 되는 코멘트".into(),
        })
        .unwrap();
    fixture.world.database().execute("INSERT INTO messages(id,task_id,seq,role,content,created_at) VALUES(?1,?2,1,'USER','내보내면 안 되는 대화',1)", [&fixture.world.runtime.id(), &fixture.task]).unwrap();
}

fn assert_excluded_metadata(fixture: &ReviewWorld) {
    let snapshot = fixture
        .world
        .store
        .export_snapshot(&request(&fixture.head))
        .unwrap();
    assert_eq!(snapshot.document.content, BASE);
    assert_ne!(snapshot.document.content, CANDIDATE);
    assert_eq!(snapshot.pending_groups, 3);
    assert_eq!(snapshot.pending_rewrites, 0);
}

#[test]
fn invalid_schema_and_identifiers_never_return_document_content() {
    let fixture = ReviewWorld::new();
    let mut invalid = request(&fixture.head);
    invalid.schema_version = 99;
    assert_eq!(
        fixture
            .world
            .store
            .export_snapshot(&invalid)
            .unwrap_err()
            .code,
        ErrorCode::SchemaUnsupported
    );
    invalid.schema_version = 1;
    invalid.document_id = "invalid".into();
    assert_eq!(
        fixture
            .world
            .store
            .export_snapshot(&invalid)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
}
