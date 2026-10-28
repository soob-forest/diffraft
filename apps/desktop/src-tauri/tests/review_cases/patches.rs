use crate::world::{BASE, response};
use docreview_core::{
    document::{
        diff::compare,
        patch::{requires_dependency_group, validate_patch},
        scope::select,
    },
    domain::{
        ai::{AiChange, AiResponse},
        document::{DocumentSnapshot, DocumentStatus},
        editor::ScopeSelection,
    },
};

fn document(content: &str) -> DocumentSnapshot {
    DocumentSnapshot {
        id: String::new(),
        title: String::new(),
        path: String::new(),
        version_id: String::new(),
        version: 1,
        content: content.into(),
        content_hash: String::new(),
        status: DocumentStatus::Ready,
    }
}

fn patch(before: &str, after: &str) -> AiResponse {
    AiResponse::Patch {
        schema_version: 1,
        summary: String::new(),
        changes: vec![AiChange {
            block_id: "b1".into(),
            before: before.into(),
            after: after.into(),
            reason: String::new(),
        }],
    }
}

#[test]
fn rejects_ambiguous_overlapping_matches_inside_one_block() {
    let scope = select(&document("aaa"), ScopeSelection::Whole).unwrap();
    assert!(validate_patch("aaa", &scope, &patch("aa", "b")).is_err());
}

#[test]
fn rejects_duplicates_overlap_out_of_scope_empty_anchor_and_split_graphemes() {
    let base = "한😀e\u{301}\r\n";
    let scope = select(&document(base), ScopeSelection::Whole).unwrap();
    for (before, after) in [
        ("e", "E"),
        ("\r", ""),
        ("", "x"),
        ("없음", "x"),
        ("한", "\0"),
    ] {
        assert!(validate_patch(base, &scope, &patch(before, after)).is_err());
    }
    let mut duplicate = patch("한", "글");
    if let AiResponse::Patch { changes, .. } = &mut duplicate {
        changes.push(changes[0].clone());
    }
    assert!(validate_patch(base, &scope, &duplicate).is_err());
    let scope = select(
        &document(BASE),
        ScopeSelection::Selection { from: 0, to: 10 },
    )
    .unwrap();
    assert!(validate_patch(BASE, &scope, &response()).is_err());
}

#[test]
fn exact_unicode_mixed_newline_and_whitespace_are_preserved() {
    let base = "\u{feff}한😀e\u{301}\r\n다음\r끝\n";
    let scope = select(&document(base), ScopeSelection::Whole).unwrap();
    let operations = validate_patch(base, &scope, &patch("😀", "👩‍💻")).unwrap();
    assert_eq!(
        docreview_core::document::patch::apply(base, &operations).unwrap(),
        base.replace('😀', "👩‍💻")
    );
    assert!(!requires_dependency_group(&operations));
    let (_, stats) = compare("a  \r\nb\r끝", "a \r\nb\r끝\n", &[]);
    assert_eq!((stats.added_lines, stats.removed_lines), (2, 2));
}

#[test]
fn structural_edits_are_grouped_and_noop_is_omitted() {
    let base = "# 제목\n";
    let scope = select(&document(base), ScopeSelection::Whole).unwrap();
    let operations = validate_patch(base, &scope, &patch("# 제목", "## 제목")).unwrap();
    assert!(requires_dependency_group(&operations));
    assert!(
        validate_patch(base, &scope, &patch("# 제목", "# 제목"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn structure_is_detected_from_the_original_block_not_only_the_changed_words() {
    for base in ["# 제목\n", "1. 제목\n", "```text\n제목\n```\n"] {
        let scope = select(&document(base), ScopeSelection::Whole).unwrap();
        let operations = validate_patch(base, &scope, &patch("제목", "다른 제목")).unwrap();
        assert!(requires_dependency_group(&operations), "{base}");
    }
}

#[test]
fn replacement_cannot_join_graphemes_outside_its_approved_range() {
    let scope = select(&document("ab"), ScopeSelection::Whole).unwrap();
    assert!(validate_patch("ab", &scope, &patch("b", "\u{301}")).is_err());
}

#[test]
fn empty_document_can_receive_one_anchored_proposal_without_implicit_approval() {
    let scope = select(&document(""), ScopeSelection::Whole).unwrap();
    let operations = validate_patch("", &scope, &patch("", "# 새 문서\n본문\n")).unwrap();
    assert_eq!(operations.len(), 1);
    assert_eq!(operations[0].range.from, 0);
    assert_eq!(operations[0].range.to, 0);
    assert_eq!(
        docreview_core::document::patch::apply("", &operations).unwrap(),
        "# 새 문서\n본문\n"
    );
    let mut duplicate = patch("", "추가");
    if let AiResponse::Patch { changes, .. } = &mut duplicate {
        changes.push(changes[0].clone());
    }
    assert!(validate_patch("", &scope, &duplicate).is_err());
}
