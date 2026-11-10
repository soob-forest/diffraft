use super::patch_structure::ambiguous_structure;
use crate::domain::{
    error::AppError,
    review::{ByteRange, EditOperation},
};
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

pub(super) struct Fence {
    pub range: ByteRange,
    pub opening: ByteRange,
    pub closed: bool,
    context: Vec<TagEnd>,
}

pub(super) fn scan(text: &str) -> Vec<Fence> {
    let source = text.trim_start_matches('\u{feff}');
    let prefix = text.len() - source.len();
    let mut result = Vec::new();
    let mut active = None;
    let mut context = Vec::new();
    for (event, range) in Parser::new_ext(source, Options::ENABLE_TABLES).into_offset_iter() {
        match event {
            Event::Start(tag) => {
                if matches!(tag, Tag::CodeBlock(CodeBlockKind::Fenced(_))) {
                    active = Some(start_fence(source, range, prefix, context.clone()));
                }
                context.push(tag.to_end());
            }
            Event::Text(_) => {
                if let Some((_, end)) = &mut active {
                    *end = (*end).max(range.end);
                }
            }
            Event::End(tag) => {
                if let Some((mut fence, body_end)) =
                    active.take().filter(|_| tag == TagEnd::CodeBlock)
                {
                    // A real closer is consumed outside Text; container-only EOF tails are not closers.
                    fence.closed = body_end < range.end
                        && source[body_end..range.end]
                            .bytes()
                            .any(|b| b == source.as_bytes()[range.start]);
                    result.push(fence);
                }
                context.pop();
            }
            _ => {}
        }
    }
    result
}

pub(super) fn validate(base: &str, candidate: &str, ops: &[EditOperation]) -> Result<(), AppError> {
    let old = scan(base);
    for fence in scan(candidate).into_iter().filter(|f| !f.closed) {
        let preserved = old.iter().filter(|f| !f.closed).any(|original| {
            original.context == fence.context
                && map_opening(&original.opening, ops) == Some(fence.opening.from)
                && map_end(original.range.to, ops) == Some(fence.range.to)
        });
        if !preserved {
            return Err(ambiguous_structure());
        }
    }
    Ok(())
}

fn map_end(end: u32, ops: &[EditOperation]) -> Option<u32> {
    let mut delta = 0i64;
    for op in ops {
        let change = op.after.len() as i64 - op.before.len() as i64;
        if op.range.to <= end {
            delta += change;
        } else if op.range.from < end {
            let suffix = op
                .before
                .bytes()
                .rev()
                .zip(op.after.bytes().rev())
                .take_while(|(a, b)| a == b)
                .count();
            if end as usize >= op.range.to as usize - suffix {
                delta += change;
                continue;
            }
            let prefix = op
                .before
                .bytes()
                .zip(op.after.bytes())
                .take_while(|(a, b)| a == b)
                .count();
            if end as usize > op.range.from as usize + prefix {
                return None;
            }
        }
    }
    u32::try_from(i64::from(end) + delta).ok()
}

fn map_opening(opening: &ByteRange, ops: &[EditOperation]) -> Option<u32> {
    let mut delta = 0i64;
    for op in ops {
        let change = op.after.len() as i64 - op.before.len() as i64;
        if op.range.to <= opening.from {
            delta += change;
        } else if op.range.from < opening.to && opening.from < op.range.to {
            let prefix = op
                .before
                .bytes()
                .zip(op.after.bytes())
                .take_while(|(a, b)| a == b)
                .count();
            if opening.to as usize <= op.range.from as usize + prefix {
                continue;
            }
            let suffix = op
                .before
                .bytes()
                .rev()
                .zip(op.after.bytes().rev())
                .take_while(|(a, b)| a == b)
                .count();
            if opening.from as usize >= op.range.to as usize - suffix {
                delta += change;
            } else {
                return None;
            }
        }
    }
    u32::try_from(i64::from(opening.from) + delta).ok()
}

fn start_fence(
    source: &str,
    range: std::ops::Range<usize>,
    prefix: usize,
    context: Vec<TagEnd>,
) -> (Fence, usize) {
    let line_end = source[range.clone()]
        .find(['\r', '\n'])
        .map_or(range.end, |n| range.start + n);
    let mut body_start = line_end;
    if source.as_bytes().get(body_start) == Some(&b'\r') {
        body_start += 1;
    }
    if source.as_bytes().get(body_start) == Some(&b'\n') {
        body_start += 1;
    }
    (
        Fence {
            range: ByteRange {
                from: (range.start + prefix) as u32,
                to: (range.end + prefix) as u32,
            },
            opening: ByteRange {
                from: (range.start + prefix) as u32,
                to: (line_end + prefix) as u32,
            },
            closed: false,
            context,
        },
        body_start,
    )
}
