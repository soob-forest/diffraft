use docreview_core::{
    document::{patch::apply, patch_groups::plan},
    domain::review::{ByteRange, EditOperation},
};

fn operation(base: &str, before: &str, after: &str) -> EditOperation {
    let from = base.find(before).unwrap();
    EditOperation {
        range: ByteRange {
            from: from as u32,
            to: (from + before.len()) as u32,
        },
        block_id: "test".into(),
        heading_path: vec![],
        before: before.into(),
        after: after.into(),
        reason: "fixture".into(),
        requires_group: false,
    }
}

#[test]
fn ordinary_text_inside_structures_and_same_hunk_is_independent() {
    let base = "# Heading\n\n- one noise\n- two noise\n\n| A | B |\n| - | - |\n| three noise | x |\n\n```text\nfour noise\n```\n";
    let ops = [
        operation(base, "one noise", "one"),
        operation(base, "two noise", "two"),
        operation(base, "three noise", "three"),
        operation(base, "four noise", "four"),
    ];
    let groups = plan(base, &ops).unwrap();
    assert_eq!(
        groups.iter().map(|g| g.members.clone()).collect::<Vec<_>>(),
        vec![vec![0], vec![1], vec![2], vec![3]]
    );
    assert_eq!(plan(base, &ops).unwrap(), groups);
}

#[test]
fn reference_edges_cover_old_and_new_usage_but_not_unrelated_text() {
    let base = "[Old][id]\n\n[id]: /old\n\nplain noise\n";
    let ops = [
        operation(base, "[Old][id]", "[New][next]"),
        operation(base, "[id]: /old", "[next]: /new"),
        operation(base, "plain noise", "plain"),
    ];
    assert_eq!(
        plan(base, &ops)
            .unwrap()
            .iter()
            .map(|g| g.members.clone())
            .collect::<Vec<_>>(),
        vec![vec![0, 1], vec![2]]
    );
}

#[test]
fn anchored_move_joins_only_deletion_and_insertion() {
    let base = "moved paragraph\n\nkeep here\n\nplain noise\n";
    let ops = [
        operation(base, "moved paragraph\n\n", ""),
        operation(base, "keep here", "keep here\n\nmoved paragraph"),
        operation(base, "plain noise", "plain"),
    ];
    assert_eq!(
        plan(base, &ops)
            .unwrap()
            .iter()
            .map(|g| g.members.clone())
            .collect::<Vec<_>>(),
        vec![vec![0, 1], vec![2]]
    );
    assert_eq!(
        apply(base, &ops).unwrap(),
        "keep here\n\nmoved paragraph\n\nplain\n"
    );
}

#[test]
fn structure_changes_are_local_and_fences_cannot_be_partially_renamed() {
    let base = "# Section\n\n```text\ncode\n```\n\nplain noise\n\n# Other\n\nmore noise\n";
    let ops = [
        operation(base, "```text", "~~~text"),
        operation(base, "code\n```", "code\n~~~"),
        operation(base, "plain noise", "plain"),
        operation(base, "more noise", "more"),
    ];
    assert_eq!(
        plan(base, &ops)
            .unwrap()
            .iter()
            .map(|g| g.members.clone())
            .collect::<Vec<_>>(),
        vec![vec![0, 1], vec![2], vec![3]]
    );
    assert!(plan(base, &ops[..1]).is_err());
}

#[test]
fn heading_level_connects_its_section_but_wording_does_not() {
    let base = "# First\n\ninside noise\n\n# Second\n\noutside noise\n";
    let ops = [
        operation(base, "# First", "## First"),
        operation(base, "inside noise", "inside"),
        operation(base, "outside noise", "outside"),
    ];
    assert_eq!(
        plan(base, &ops)
            .unwrap()
            .iter()
            .map(|g| g.members.clone())
            .collect::<Vec<_>>(),
        vec![vec![0, 1], vec![2]]
    );
    let ops = [
        operation(base, "First", "Opening"),
        operation(base, "inside noise", "inside"),
    ];
    assert_eq!(plan(base, &ops).unwrap().len(), 2);
}

#[test]
fn table_and_nested_list_structure_changes_stay_inside_their_container() {
    for (base, before, after, wording) in [
        (
            "| A | B |\n| --- | --- |\n| cell noise | x |\n\nplain noise\n",
            "| --- | --- |",
            "| :--- | ---: |",
            "cell noise",
        ),
        (
            "- parent\n  - child noise\n\nplain noise\n",
            "- parent",
            "1. parent",
            "child noise",
        ),
    ] {
        let ops = [
            operation(base, before, after),
            operation(base, wording, &wording.replace(" noise", "")),
            operation(base, "plain noise", "plain"),
        ];
        assert_eq!(
            plan(base, &ops)
                .unwrap()
                .iter()
                .map(|g| g.members.clone())
                .collect::<Vec<_>>(),
            vec![vec![0, 1], vec![2]]
        );
    }
}

#[test]
fn repeated_text_is_not_inferred_as_a_unique_move() {
    let base = "repeated\n\nrepeated\n\nanchor\n";
    let ops = [
        operation(base, "repeated", ""),
        operation(base, "anchor", "anchor\n\nrepeated"),
    ];
    assert_eq!(plan(base, &ops).unwrap().len(), 2);
}

#[test]
fn a_fence_like_last_line_with_text_is_not_a_valid_closing_fence() {
    let base = "```text\ncode\n```\n";
    let ops = [
        operation(base, "```text", "~~~text"),
        operation(base, "code\n```", "code\n~~~invalid"),
    ];
    assert!(plan(base, &ops).is_err());
}

#[test]
fn unicode_newlines_and_many_groups_preserve_exact_bytes() {
    let base = format!(
        "\u{feff}{}",
        (0..100)
            .map(|i| format!("문단{i} 👩‍💻e\u{301} noise\r\n\r\n"))
            .collect::<String>()
    );
    let ops = (0..100)
        .map(|i| {
            operation(
                &base,
                &format!("문단{i} 👩‍💻e\u{301} noise"),
                &format!("문단{i} 👩‍💻e\u{301}"),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(plan(&base, &ops).unwrap().len(), 100);
    assert_eq!(apply(&base, &ops).unwrap(), base.replace(" noise", ""));
    assert!(plan(&base, &[ops[0].clone(), ops[0].clone()]).is_err());
}
