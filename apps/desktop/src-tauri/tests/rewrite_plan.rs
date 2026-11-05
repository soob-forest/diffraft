use docreview_core::document::{
    patch::apply,
    rewrite_plan::{PlannedUnit, plan},
};

fn selected(before: &str, units: &[PlannedUnit], mask: usize) -> String {
    let operations = units
        .iter()
        .enumerate()
        .filter(|(i, _)| mask & (1 << i) != 0)
        .flat_map(|(_, unit)| unit.operations.clone())
        .collect::<Vec<_>>();
    apply(before, &operations).unwrap()
}

#[test]
fn adjacent_paragraphs_can_be_decided_independently() {
    let before = "누구나 이용합니다.\n\n월요일까지 신청합니다.\n";
    let after = "회원이 이용합니다.\n\n금요일까지 신청합니다.\n";
    let units = plan(before, after).unwrap();
    assert_eq!(units.len(), 2);
    assert_eq!(
        selected(before, &units, 1),
        "회원이 이용합니다.\n\n월요일까지 신청합니다.\n"
    );
    assert_eq!(
        selected(before, &units, 2),
        "누구나 이용합니다.\n\n금요일까지 신청합니다.\n"
    );
    assert_eq!(selected(before, &units, 3), after);
}

#[test]
fn structural_containers_and_paragraph_merge_are_atomic() {
    let cases = [
        (
            "| 항목 | 값 |\n| --- | --- |\n| a | 1 |\n",
            "| 항목 | 값 | 새 열 |\n| --- | --- | --- |\n| a | 2 | b |\n",
        ),
        ("- 하나\n- 둘\n", "- 첫째\n  - 하위\n- 둘째\n"),
        (
            "```md\n# 원문\n본문\n```\n",
            "```md\n## 후보\n새 본문\n```\n",
        ),
        ("첫 문단\n\n둘째 문단\n", "첫 문단과 둘째 문단\n"),
        ("> 원문\n> 인용\n", "> 새 인용\n> 다음\n"),
    ];
    for (before, after) in cases {
        let units = plan(before, after).unwrap();
        assert_eq!(units.len(), 1, "{before}");
        assert_eq!(selected(before, &units, 1), after);
    }
}

#[test]
fn moved_unique_paragraph_is_one_unit_with_two_operations() {
    let before = "# 문서\n\n이동할 문단\n\n고정 하나\n\n고정 둘\n\n끝\n";
    let after = "# 문서\n\n고정 하나\n\n고정 둘\n\n이동할 문단\n\n끝\n";
    let units = plan(before, after).unwrap();
    assert_eq!(units.len(), 1);
    assert_eq!(units[0].kind, "move");
    assert_eq!(units[0].operations.len(), 2);
    assert_eq!(selected(before, &units, 1), after);
}

#[test]
fn unicode_newlines_bom_empty_documents_and_raw_html_round_trip() {
    for (before, after) in [
        (
            "\u{feff}한 👩‍💻 e\u{301}\r\n\r\n다음\r",
            "\u{feff}한 👩‍🚀 é\r\n\r\n새 다음\r",
        ),
        ("", "# 새 문서\n\n본문\n"),
        ("본문\n\n다음\n", ""),
        (" \r\n", "\t\n"),
        ("<div>원문</div>\n", "<div>후보</div>\n"),
        ("같은 문단\n\n같은 문단\n", "같은 문단\n\n바뀐 문단\n"),
    ] {
        let units = plan(before, after).unwrap();
        assert!(!units.is_empty());
        assert_eq!(selected(before, &units, (1 << units.len()) - 1), after);
        assert_eq!(selected(before, &units, 0), before);
    }
    assert!(plan("같음\n", "같음\n").unwrap().is_empty());
}

#[test]
fn all_subsets_are_exact_and_plans_are_deterministic() {
    let before = "첫 문단\n\n둘 문단\n\n셋 문단\n\n넷 문단\n";
    let after = "첫 수정\n\n둘 수정\n\n셋 수정\n\n넷 수정\n";
    let units = plan(before, after).unwrap();
    assert_eq!(units.len(), 4);
    for mask in 0..16 {
        let expected = (0..4)
            .map(|i| {
                let names = ["첫", "둘", "셋", "넷"];
                format!(
                    "{} {}{}",
                    names[i],
                    if mask & (1 << i) != 0 {
                        "수정"
                    } else {
                        "문단"
                    },
                    if i == 3 { "\n" } else { "\n\n" }
                )
            })
            .collect::<String>();
        assert_eq!(selected(before, &units, mask), expected);
    }
    assert_eq!(
        format!("{units:?}"),
        format!("{:?}", plan(before, after).unwrap())
    );
}

#[test]
fn work_budget_falls_back_losslessly_and_invalid_input_is_rejected() {
    let before = (0..600)
        .map(|i| format!("문단 {i}\n\n"))
        .collect::<String>();
    let after = before.replace("문단", "변경");
    let units = plan(&before, &after).unwrap();
    assert_eq!(units.len(), 1);
    assert_eq!(selected(&before, &units, 1), after);
    assert!(plan("원문", "잘못\0된 후보").is_err());
}

#[test]
fn changed_heading_structure_and_explicit_reference_targets_are_grouped() {
    for (before, after) in [
        (
            "# 제목\n\n본문\n\n# 다음\n\n유지\n",
            "## 제목\n\n바뀐 본문\n\n# 다음\n\n유지\n",
        ),
        (
            "설명 [문서][guide]\n\n다른 문단\n\n[guide]: https://example.test/old\n",
            "새 설명 [문서][guide]\n\n다른 문단\n\n[guide]: https://example.test/new\n",
        ),
    ] {
        let units = plan(before, after).unwrap();
        assert_eq!(units.len(), 1);
        assert_eq!(selected(before, &units, 1), after);
    }
}

#[test]
fn seeded_large_subsets_keep_exact_unselected_paragraphs() {
    let before = (0..120)
        .map(|i| format!("문단 {i}\r\n\r\n"))
        .collect::<String>();
    let after = before.replace("문단", "수정");
    let units = plan(&before, &after).unwrap();
    assert_eq!(units.len(), 120);
    let mut seed = 1701u32;
    for _ in 0..40 {
        let mut ops = Vec::new();
        let mut expected = String::new();
        for (i, unit) in units.iter().enumerate() {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let accepted = seed & 0x8000 != 0;
            if accepted {
                ops.extend(unit.operations.clone());
            }
            expected.push_str(&format!(
                "{} {i}\r\n\r\n",
                if accepted { "수정" } else { "문단" }
            ));
        }
        assert_eq!(apply(&before, &ops).unwrap(), expected);
    }
}
