use crate::domain::{
    review::ByteRange,
    review_view::{DiffHunk, DiffLine, DiffSegment, DiffStats, ReviewGroup},
};
use similar::{ChangeTag, DiffOp, TextDiff};
use std::time::{Duration, Instant};

const CONTEXT_LINES: usize = 3;
const LINE_DIFF_TIMEOUT: Duration = Duration::from_millis(150);
const INLINE_TIMEOUT: Duration = Duration::from_millis(5);
const INLINE_TOTAL_TIMEOUT: Duration = Duration::from_millis(30);
const MAX_INLINE_PAIRS: usize = 256;
const MAX_INLINE_BYTES: usize = 4096;

pub fn compare(before: &str, after: &str, groups: &[ReviewGroup]) -> (Vec<DiffHunk>, DiffStats) {
    let old = logical_lines(before);
    let new = logical_lines(after);
    let diff = TextDiff::configure()
        .timeout(LINE_DIFF_TIMEOUT)
        .diff_slices(&old, &new);
    let old_offsets = offsets(&old);
    let new_offsets = offsets(&new);
    let mut refinement = Refinement {
        deadline: Instant::now() + INLINE_TOTAL_TIMEOUT,
        remaining: MAX_INLINE_PAIRS,
    };
    let stats = statistics(&diff, groups.len());
    let hunks = diff
        .grouped_ops(CONTEXT_LINES)
        .iter()
        .map(|ops| {
            let old_range = range(ops, &old_offsets, true);
            let new_range = range(ops, &new_offsets, false);
            let group_ids = groups
                .iter()
                .filter(|group| {
                    group
                        .before_ranges
                        .iter()
                        .any(|r| intersects(r, &old_range))
                        || group.after_ranges.iter().any(|r| intersects(r, &new_range))
                })
                .map(|group| group.id.clone())
                .collect();
            DiffHunk {
                old_range,
                new_range,
                lines: lines(&diff, ops, &mut refinement),
                group_ids,
            }
        })
        .collect();
    (hunks, stats)
}

fn statistics(diff: &TextDiff<'_, '_, str>, pending: usize) -> DiffStats {
    let mut stats = DiffStats {
        added_lines: 0,
        removed_lines: 0,
        pending_groups: pending as u32,
    };
    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Delete => stats.removed_lines += 1,
            ChangeTag::Insert => stats.added_lines += 1,
            ChangeTag::Equal => {}
        }
    }
    stats
}

fn lines(
    diff: &TextDiff<'_, '_, str>,
    ops: &[DiffOp],
    refinement: &mut Refinement,
) -> Vec<DiffLine> {
    let mut lines = Vec::new();
    for op in ops {
        let start = lines.len();
        for change in diff.iter_changes(op) {
            let kind = match change.tag() {
                ChangeTag::Equal => "equal",
                ChangeTag::Delete => "delete",
                ChangeTag::Insert => "insert",
            };
            lines.push(DiffLine {
                kind: kind.into(),
                old_line: change.old_index().map(|i| i as u32 + 1),
                new_line: change.new_index().map(|i| i as u32 + 1),
                segments: vec![DiffSegment {
                    text: change.value().to_owned(),
                    changed: change.tag() != ChangeTag::Equal,
                }],
            });
        }
        refine(&mut lines[start..], refinement);
    }
    lines
}

struct Refinement {
    deadline: Instant,
    remaining: usize,
}

fn refine(lines: &mut [DiffLine], refinement: &mut Refinement) {
    let deleted: Vec<_> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| line.kind == "delete")
        .map(|(i, _)| i)
        .collect();
    let inserted: Vec<_> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| line.kind == "insert")
        .map(|(i, _)| i)
        .collect();
    if deleted.len() != inserted.len() {
        return;
    }
    for (old, new) in deleted.into_iter().zip(inserted) {
        if refinement.remaining == 0 || Instant::now() >= refinement.deadline {
            break;
        }
        refinement.remaining -= 1;
        let before = lines[old].segments[0].text.clone();
        let after = lines[new].segments[0].text.clone();
        if before.len() + after.len() > MAX_INLINE_BYTES {
            continue;
        }
        let diff = TextDiff::configure()
            .deadline(refinement.deadline.min(Instant::now() + INLINE_TIMEOUT))
            .diff_graphemes(&before, &after);
        let mut old_segments = Vec::new();
        let mut new_segments = Vec::new();
        for change in diff.iter_all_changes() {
            let changed = change.tag() != ChangeTag::Equal;
            if change.tag() != ChangeTag::Insert {
                push_segment(&mut old_segments, change.value(), changed);
            }
            if change.tag() != ChangeTag::Delete {
                push_segment(&mut new_segments, change.value(), changed);
            }
        }
        lines[old].segments = old_segments;
        lines[new].segments = new_segments;
    }
}

fn push_segment(segments: &mut Vec<DiffSegment>, text: &str, changed: bool) {
    if let Some(last) = segments.last_mut()
        && last.changed == changed
    {
        last.text.push_str(text);
    } else {
        segments.push(DiffSegment {
            text: text.into(),
            changed,
        });
    }
}

pub fn logical_lines(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let mut start = 0;
    let bytes = text.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' || (*byte == b'\r' && bytes.get(index + 1) != Some(&b'\n')) {
            lines.push(&text[start..=index]);
            start = index + 1;
        }
    }
    if start < text.len() {
        lines.push(&text[start..]);
    }
    lines
}

fn offsets(lines: &[&str]) -> Vec<u32> {
    let mut offsets = vec![0];
    for line in lines {
        offsets.push(offsets.last().copied().unwrap_or(0) + line.len() as u32);
    }
    offsets
}

fn range(ops: &[DiffOp], offsets: &[u32], old: bool) -> ByteRange {
    let ranges: Vec<_> = ops
        .iter()
        .map(|op| if old { op.old_range() } else { op.new_range() })
        .collect();
    let start = ranges.first().map_or(0, |r| r.start);
    let end = ranges.last().map_or(0, |r| r.end);
    ByteRange {
        from: offsets[start],
        to: offsets[end],
    }
}

fn intersects(left: &ByteRange, right: &ByteRange) -> bool {
    if left.from == left.to {
        left.from >= right.from && left.from <= right.to
    } else {
        left.from < right.to && left.to > right.from
    }
}
