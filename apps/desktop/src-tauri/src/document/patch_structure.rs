use super::{parse::analyze, patch::apply, patch_fences};
use crate::domain::{
    error::AppError,
    review::{ByteRange, EditOperation},
};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

const STRUCTURE: &str = "연결된 Markdown 구조 변경을 함께 적용합니다.";

struct Region {
    range: ByteRange,
    trigger: ByteRange,
}

pub(super) fn edges(
    base: &str,
    candidate: &str,
    ops: &[EditOperation],
    after: &[ByteRange],
) -> Result<Vec<(usize, usize, &'static str)>, AppError> {
    patch_fences::validate(base, candidate, ops)?;
    let original_shape = shape(base);
    let candidate_shape = shape(candidate);
    let before = ops.iter().map(|op| op.range.clone()).collect::<Vec<_>>();
    let old_regions = regions(base);
    let new_regions = regions(candidate);
    let mut edges = Vec::new();
    for (i, op) in ops.iter().enumerate() {
        let remaining = ops
            .iter()
            .enumerate()
            .filter(|(j, _)| *j != i)
            .map(|(_, op)| op.clone())
            .collect::<Vec<_>>();
        if shape(&apply(base, std::slice::from_ref(op))?) == original_shape
            && shape(&apply(base, &remaining)?) == candidate_shape
        {
            continue;
        }
        let mut bounded = false;
        for (regions, ranges) in [(&old_regions, before.as_slice()), (&new_regions, after)] {
            for region in regions
                .iter()
                .filter(|r| intersects(&ranges[i], &r.trigger))
            {
                bounded = true;
                edges.extend(
                    ranges
                        .iter()
                        .enumerate()
                        .filter(|(_, r)| intersects(r, &region.range))
                        .map(|(j, _)| (i, j, STRUCTURE)),
                );
            }
        }
        if !bounded {
            return Err(ambiguous_structure());
        }
    }
    Ok(edges)
}

fn regions(text: &str) -> Vec<Region> {
    let prefix = text.len() - text.trim_start_matches('\u{feff}').len();
    let mut ranges = Parser::new_ext(&text[prefix..], Options::ENABLE_TABLES)
        .into_offset_iter()
        .filter_map(|(event, r)| match event {
            Event::Start(Tag::CodeBlock(_) | Tag::List(_) | Tag::Table(_) | Tag::BlockQuote(_))
            | Event::Rule => {
                let range = ByteRange {
                    from: (r.start + prefix) as u32,
                    to: (r.end + prefix) as u32,
                };
                Some(Region {
                    trigger: range.clone(),
                    range,
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    ranges.extend(analyze(text).headings.into_iter().map(|h| {
        let start = h.from as usize;
        let header_end = start + text[start..].find('\n').unwrap_or(text.len() - start);
        Region {
            range: ByteRange {
                from: h.from,
                to: h.to,
            },
            trigger: ByteRange {
                from: h.from,
                to: header_end as u32,
            },
        }
    }));
    ranges
}

fn shape(text: &str) -> Vec<String> {
    let source = text.trim_start_matches('\u{feff}');
    let fences = patch_fences::scan(text);
    let prefix = text.len() - source.len();
    Parser::new_ext(source, Options::ENABLE_TABLES)
        .into_offset_iter()
        .filter_map(|(event, range)| match event {
            Event::Start(
                tag @ (Tag::Heading { .. }
                | Tag::List(_)
                | Tag::Item
                | Tag::Table(_)
                | Tag::TableHead
                | Tag::TableRow
                | Tag::TableCell
                | Tag::BlockQuote(_)),
            ) => Some(format!("{tag:?}")),
            Event::Start(tag @ Tag::CodeBlock(_)) => {
                let raw = &source[range.clone()];
                Some(format!(
                    "{tag:?}:{}:{}",
                    fence(raw.lines().next().unwrap_or("")),
                    fences
                        .iter()
                        .find(|f| f.range.from as usize == range.start + prefix)
                        .is_none_or(|f| f.closed)
                ))
            }
            Event::End(
                tag @ (TagEnd::Heading(_)
                | TagEnd::List(_)
                | TagEnd::Item
                | TagEnd::Table
                | TagEnd::TableHead
                | TagEnd::TableRow
                | TagEnd::TableCell
                | TagEnd::BlockQuote(_)),
            ) => Some(format!("/{tag:?}")),
            Event::Rule => Some("rule".into()),
            _ => None,
        })
        .collect()
}

fn fence(line: &str) -> String {
    line.trim_start()
        .chars()
        .take_while(|c| matches!(c, '`' | '~'))
        .collect()
}

pub(super) fn intersects(a: &ByteRange, b: &ByteRange) -> bool {
    if a.from == a.to {
        a.from >= b.from && a.from < b.to
    } else {
        a.from < b.to && b.from < a.to
    }
}

pub(super) fn ambiguous_structure() -> AppError {
    AppError::invalid(
        "Markdown 구조의 안전한 변경 범위를 확인할 수 없습니다. 더 좁은 범위로 다시 요청해 주세요.",
    )
}
