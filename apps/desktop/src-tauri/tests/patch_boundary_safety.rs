use docreview_core::{
    document::{parse::analyze, patch::validate_patch, patch_groups::plan},
    domain::{
        ai::{AiChange, AiResponse},
        editor::ScopeSnapshot,
        review::EditOperation,
    },
};
fn validated(base: &str, changes: &[(&str, &str)]) -> Vec<EditOperation> {
    let blocks = analyze(base).blocks;
    let changes = changes
        .iter()
        .map(|(before, after)| AiChange {
            block_id: blocks
                .iter()
                .find(|b| b.text.contains(before))
                .unwrap()
                .id
                .clone(),
            before: (*before).into(),
            after: (*after).into(),
            reason: "synthetic review".into(),
        })
        .collect();
    let scope = ScopeSnapshot {
        document_id: "audit".into(),
        version_id: "audit".into(),
        version: 1,
        content_hash: "synthetic".into(),
        from: 0,
        to: base.len() as u32,
        text: base.into(),
        blocks,
    };
    validate_patch(
        base,
        &scope,
        &AiResponse::Patch {
            schema_version: 1,
            summary: "synthetic review".into(),
            changes,
        },
    )
    .expect("input must satisfy the existing PATCH contract")
}

#[test]
fn jointly_created_fences_join_only_their_own_changes() {
    for source in [
        "aabb\ncontent\nccdd\n\nplain noise\n",
        "> aabb\n> content\n> ccdd\n\nplain noise\n",
        "\u{feff}aabb\r\n한글 😀\r\nccdd\r\n\r\nplain noise\r\n",
    ] {
        let ops = validated(
            source,
            &[
                ("aa", "`"),
                ("bb", "``"),
                ("cc", "`"),
                ("dd", "``"),
                ("plain noise", "plain"),
            ],
        );
        assert_eq!(
            plan(source, &ops)
                .unwrap()
                .iter()
                .map(|g| g.members.clone())
                .collect::<Vec<_>>(),
            vec![vec![0, 1, 2, 3], vec![4]],
            "{source:?}",
        );
    }
}

#[test]
fn unchanged_opener_cannot_authorize_a_different_unclosed_container() {
    for (source, before, after) in [
        ("> ```\n> code\n\noutside noise\n", "> ```", "```"),
        ("> ```\n> code\n", "> ```", "```"),
        ("- ```\n  code\n", "- ```", "```"),
        ("> - ```\n>   code\n", "> - ```", "> ```"),
    ] {
        assert!(
            plan(source, &validated(source, &[(before, after)])).is_err(),
            "{source:?}"
        );
    }
}

#[test]
fn unclosed_fence_must_not_expand_even_when_its_container_is_unchanged() {
    let source = "> ```\n> code\noutside noise\n";
    let ops = validated(source, &[("outside noise", "> outside noise")]);
    assert!(plan(source, &ops).is_err());
}

#[test]
fn existing_unclosed_fence_body_and_unrelated_text_edits_remain_independent() {
    for source in [
        "old noise\n\n```text\ncode noise",
        "old noise\n\n> ```text\n> code noise\n\noutside noise\n",
        "\u{feff}old noise\r\n\r\n> - ```text\r\n>   code noise\r\n",
    ] {
        let ops = validated(
            source,
            &[
                ("old noise", "old corrected"),
                ("code noise", "code corrected"),
            ],
        );
        assert_eq!(plan(source, &ops).unwrap().len(), 2, "{source:?}");
    }
}
