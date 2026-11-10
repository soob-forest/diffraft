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
fn independent_word_corrections_are_not_a_paragraph_move() {
    let base = "이 기능은 불가능합니다.\n\n상태는 안정합니다.\n";
    let ops = validated(base, &[("불가능", "가능"), ("안정", "불안정")]);
    assert_eq!(plan(base, &ops).unwrap().len(), 2);
}
#[test]
fn invalid_closing_fence_is_rejected_without_also_changing_the_opener() {
    let base = "```text\ncode\n```\n";
    let ops = validated(base, &[("code\n```", "code\n```invalid")]);
    assert!(plan(base, &ops).is_err());
}
#[test]
fn valid_paired_fence_change_inside_a_quote_is_accepted() {
    let base = "> ```text\n> code\n> ```\n\nplain noise\n";
    let ops = validated(
        base,
        &[
            ("```text", "~~~text"),
            ("code\n> ```", "code\n> ~~~"),
            ("plain noise", "plain"),
        ],
    );
    assert_eq!(plan(base, &ops).unwrap().len(), 2);
}
#[test]
fn ordinary_separated_corrections_still_work() {
    let base = "one noise\n\n- two noise\n";
    let ops = validated(base, &[("one noise", "one"), ("two noise", "two")]);
    assert_eq!(plan(base, &ops).unwrap().len(), 2);
}

#[test]
fn nested_containers_preserve_real_fence_pairs_and_literal_content() {
    for (base, old_close, new_close) in [
        (
            "- ```text\n  > literal noise\n  ```\n\nplain noise\n",
            "  ```",
            "  ~~~",
        ),
        (
            "> - ```text\n>   > literal noise\n>   ```\n\nplain noise\n",
            ">   ```",
            ">   ~~~",
        ),
        (
            "\u{feff}> ```text\r\n> > literal noise\r\n> ```\r\n\r\nplain noise\r\n",
            "> ```\r\n",
            "> ~~~\r\n",
        ),
    ] {
        let ops = validated(
            base,
            &[
                ("```text", "~~~text"),
                (old_close, new_close),
                ("plain noise", "plain"),
            ],
        );
        let groups = plan(base, &ops).unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].members, vec![0, 1]);
    }
}

#[test]
fn malformed_closers_fail_but_code_body_lookalikes_with_real_closers_work() {
    let base = "```text\ncode\n```\n";
    for closing in ["``", "~~~", "```invalid", ""] {
        let after = format!("code\n{closing}");
        assert!(
            plan(base, &validated(base, &[("code\n```", &after)])).is_err(),
            "{closing:?}"
        );
    }
    for source in [
        "```text\nnoise\n````  \n",
        "   ```text\nnoise\n   ```\n",
        "```text\n```invalid\n> noise\n```",
        "~~~\nnoise\n``\n~~~\n",
    ] {
        assert!(
            plan(source, &validated(source, &[("noise", "content")])).is_ok(),
            "{source:?}"
        );
    }
    for source in ["```\n```\n", "> ```\n>\n> ```\n", "- ```\n  ```\n"] {
        assert!(plan(source, &[]).is_ok(), "{source:?}");
    }
}

#[test]
fn preexisting_unclosed_blocks_do_not_block_unrelated_or_plain_body_edits() {
    for source in [
        "old noise\n\n```text\ncode noise\n",
        "old noise\r\n\r\n> ```text\r\n> code noise\r\n",
        "old noise\n\n- ```text\n  code noise\n",
    ] {
        let body = analyze(source).blocks.last().unwrap().text.clone();
        let after = body.replace("code noise", "code");
        let ops = validated(source, &[("old noise", "old corrected"), (&body, &after)]);
        assert_eq!(plan(source, &ops).unwrap().len(), 2);
    }
}

#[test]
fn full_short_unicode_paragraphs_move_but_internal_fragments_do_not() {
    let base = "\u{feff}불\r\n\r\n기준 문단\r\n\r\n다른 문장부호!\r\n";
    let ops = validated(
        base,
        &[
            ("불", ""),
            ("기준 문단", "기준 문단\r\n\r\n불"),
            ("문장부호!", "문장부호"),
        ],
    );
    assert_eq!(
        plan(base, &ops)
            .unwrap()
            .iter()
            .map(|g| g.members.clone())
            .collect::<Vec<_>>(),
        vec![vec![0, 1], vec![2]]
    );
    let base = "prefixTOKENsuffix\n\nother sentence\n";
    let ops = validated(
        base,
        &[("TOKEN", ""), ("other sentence", "other TOKENsentence")],
    );
    assert_eq!(plan(base, &ops).unwrap().len(), 2);
}

#[test]
fn empty_container_tail_at_eof_is_not_a_closing_fence() {
    for (source, before) in [
        ("> ```\n> code\n> ```", "code\n> ```"),
        ("- ```\n  code\n  ```", "code\n  ```"),
        ("> - ```\n>   code\n>   ```", "code\n>   ```"),
    ] {
        assert!(
            plan(source, &validated(source, &[(before, "")])).is_err(),
            "{source:?}"
        );
    }
}
