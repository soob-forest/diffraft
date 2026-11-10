use crate::domain::review::{ByteRange, EditOperation};
use pulldown_cmark::{Event, Options, Parser, Tag};
use std::collections::BTreeMap;

const MOVE: &str = "문단 이동의 삭제와 추가를 함께 적용합니다.";

pub(super) fn edges(
    base: &str,
    candidate: &str,
    operations: &[EditOperation],
    after: &[ByteRange],
) -> Vec<(usize, usize, &'static str)> {
    let old = unique_paragraphs(base);
    let new = unique_paragraphs(candidate);
    let before = operations
        .iter()
        .map(|op| op.range.clone())
        .collect::<Vec<_>>();
    old.into_iter()
        .filter_map(|(body, range)| {
            let from = owner(&before, &range?)?;
            let to = owner(after, new.get(body)?.as_ref()?)?;
            (from != to).then_some((from, to, MOVE))
        })
        .collect()
}

fn unique_paragraphs(text: &str) -> BTreeMap<&str, Option<ByteRange>> {
    let source = text.trim_start_matches('\u{feff}');
    let prefix = text.len() - source.len();
    let mut depth = 0;
    let mut paragraphs = BTreeMap::new();
    for (event, range) in Parser::new_ext(source, Options::ENABLE_TABLES).into_offset_iter() {
        match event {
            Event::Start(tag) => {
                if depth == 0 && tag == Tag::Paragraph {
                    let body = source[range.clone()].trim_end_matches(['\r', '\n']);
                    let range = ByteRange {
                        from: (range.start + prefix) as u32,
                        to: (range.start + prefix + body.len()) as u32,
                    };
                    paragraphs
                        .entry(body)
                        .and_modify(|r| *r = None)
                        .or_insert(Some(range));
                }
                depth += 1;
            }
            Event::End(_) => depth -= 1,
            _ => {}
        }
    }
    paragraphs
}

fn owner(ranges: &[ByteRange], paragraph: &ByteRange) -> Option<usize> {
    ranges
        .iter()
        .position(|r| r.from <= paragraph.from && r.to >= paragraph.to)
}
