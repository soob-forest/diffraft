use docreview_core::{
    document::diff::compare,
    domain::{
        review::{ByteRange, Validity},
        review_view::ReviewGroup,
    },
};

#[test]
fn one_dependency_group_maps_to_multiple_separated_display_hunks() {
    let before: String = (0..20).map(|i| format!("row{i:02}\n")).collect();
    let after = before.replace("row00", "new00").replace("row19", "new19");
    let ranges = vec![
        ByteRange { from: 0, to: 5 },
        ByteRange { from: 114, to: 119 },
    ];
    let group = ReviewGroup {
        id: "dependent".into(),
        proposals: Vec::new(),
        before_ranges: ranges.clone(),
        after_ranges: ranges,
        validity: Validity::Valid,
    };
    let (hunks, stats) = compare(&before, &after, &[group]);
    assert_eq!(hunks.len(), 2);
    assert!(hunks.iter().all(|h| h.group_ids == ["dependent"]));
    assert_eq!(
        (stats.added_lines, stats.removed_lines, stats.pending_groups),
        (2, 2, 1)
    );
}

#[test]
fn line_highlights_do_not_split_emoji_or_combining_characters() {
    let (hunks, _) = compare("한 👩‍💻 e\u{301}\n", "한 👩‍🚀 é\n", &[]);
    let removed: String = hunks
        .iter()
        .flat_map(|h| &h.lines)
        .filter(|l| l.kind == "delete")
        .flat_map(|l| &l.segments)
        .filter(|s| s.changed)
        .map(|s| s.text.as_str())
        .collect();
    assert!(removed.contains("👩‍💻"));
    assert!(removed.contains("e\u{301}"));
}
