use docreview_core::document::{patch::apply, rewrite_plan::plan};
use pulldown_cmark::{Parser, html};

fn rendered(text: &str) -> String {
    let mut output = String::new();
    html::push_html(&mut output, Parser::new(text));
    output
}

fn reference_removal(usage: &str, label: &str, prefix: &str) {
    let before =
        format!("{prefix}{usage}\n\n유지 문단\n\n[{label}]: https://example.test/reference\n");
    let after = format!("{prefix}새 설명\n\n유지 문단\n");
    assert!(rendered(&before).contains("https://example.test/reference"));
    let units = plan(&before, &after).unwrap();
    assert_eq!(units.len(), 1, "usage={usage:?}, label={label:?}");
    assert_eq!(units[0].operations.len(), 2);
    assert_eq!(apply(&before, &[]).unwrap(), before);
    assert_eq!(apply(&before, &units[0].operations).unwrap(), after);
}

#[test]
fn normalized_reference_labels_cannot_be_partially_removed() {
    for (usage, definition) in [
        ("설명 [문서][my label]", "my   label"),
        ("설명 [문서][my   label]", "my label"),
        ("설명 [문서][my\tlabel]", "my label"),
        ("설명 [문서][my\nlabel]", "my label"),
        ("설명 [문서][MY LABEL]", "my label"),
        ("설명 [문서][STRASSE]", "straße"),
    ] {
        reference_removal(usage, definition, "");
    }
}

#[test]
fn full_collapsed_shortcut_links_and_images_share_their_definition() {
    for usage in [
        "[문서][my label]",
        "[my label][]",
        "[my label]",
        "![사진][my label]",
        "![my label][]",
        "![my label]",
    ] {
        reference_removal(usage, "my   label", "");
    }
}

#[test]
fn new_reference_usage_and_definition_are_one_unit() {
    let before = "이전 설명\n\n유지 문단\n";
    let after = "새 설명 [문서][my label]\n\n유지 문단\n\n[my\tlabel]: https://example.test/new\n";
    assert!(rendered(after).contains("<a href="));
    let units = plan(before, after).unwrap();
    assert_eq!(units.len(), 1);
    assert_eq!(apply(before, &units[0].operations).unwrap(), after);
}

#[test]
fn bom_preserves_reference_dependency_byte_offsets() {
    reference_removal("설명 [문서][my label]", "my   label", "\u{feff}");
}

#[test]
fn code_and_inline_links_do_not_create_reference_dependencies() {
    for (before_usage, after_usage) in [
        ("설명 `[guide]`", "새 설명 `[guide]`"),
        ("```md\n[guide]\n```", "```md\nnew [guide]\n```"),
        (
            "설명 [guide](https://example.test/inline)",
            "새 설명 [guide](https://example.test/inline)",
        ),
    ] {
        let before = format!(
            "{before_usage}\n\n고정 문단\n\n유지 문단\n\n[guide]: https://example.test/old\n"
        );
        let after = format!(
            "{after_usage}\n\n고정 문단\n\n유지 문단\n\n[guide]: https://example.test/new\n"
        );
        let units = plan(&before, &after).unwrap();
        assert_eq!(units.len(), 2, "{before_usage}");
        let first = apply(&before, &units[0].operations).unwrap();
        assert!(first.contains(after_usage));
        assert!(first.contains("[guide]: https://example.test/old"));
        let second = apply(&before, &units[1].operations).unwrap();
        assert!(second.contains(before_usage));
        assert!(second.contains("[guide]: https://example.test/new"));
    }
}
