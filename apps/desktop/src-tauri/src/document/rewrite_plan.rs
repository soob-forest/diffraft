use super::{
    patch::{apply, invalid_patch},
    rewrite_blocks::{self, Block},
    rewrite_groups,
};
use crate::domain::{
    ai::MAX_CHANGES,
    document::validate_content,
    error::AppError,
    review::{ByteRange, EditOperation},
};
use std::ops::Range;

pub const ALGORITHM_VERSION: u32 = 2;
const MAX_BLOCK_PRODUCT: usize = 65_536;

#[derive(Debug, Clone)]
pub struct PlannedUnit {
    pub title: String,
    pub kind: String,
    pub reason: String,
    pub operations: Vec<EditOperation>,
}

pub(super) struct Entry {
    pub operation: EditOperation,
    pub after_range: ByteRange,
    pub title: String,
    pub kind: String,
}

pub fn plan(before: &str, after: &str) -> Result<Vec<PlannedUnit>, AppError> {
    validate_content(before)?;
    validate_content(after)?;
    if before == after {
        return Ok(Vec::new());
    }
    let old = rewrite_blocks::blocks(before);
    let new = rewrite_blocks::blocks(after);
    if old.len().saturating_mul(new.len()) > MAX_BLOCK_PRODUCT {
        return whole(before, after, "변경이 많아 문서 전체를 함께 검토합니다.");
    }
    let entries = entries(before, after, &old, &new);
    let operations = entries
        .iter()
        .map(|e| e.operation.clone())
        .collect::<Vec<_>>();
    if operations.len() > MAX_CHANGES || apply(before, &operations).as_deref() != Ok(after) {
        return whole(
            before,
            after,
            "문서 경계를 보존하기 위해 전체를 함께 검토합니다.",
        );
    }
    Ok(rewrite_groups::group(entries, before, after))
}

fn entries(before: &str, after: &str, old: &[Block], new: &[Block]) -> Vec<Entry> {
    let mut entries = Vec::new();
    for (left, right) in changed_ranges(old, new) {
        if left.len() == right.len()
            && left.len() > 1
            && old[left.clone()]
                .iter()
                .zip(&new[right.clone()])
                .all(|(a, b)| a.shape == b.shape)
        {
            for (i, j) in left.zip(right) {
                entries.push(entry(before, after, old, new, (i..i + 1, j..j + 1)));
            }
        } else {
            entries.push(entry(before, after, old, new, (left, right)));
        }
    }
    entries
}

fn changed_ranges(old: &[Block], new: &[Block]) -> Vec<(Range<usize>, Range<usize>)> {
    let width = new.len() + 1;
    let mut lengths = vec![0u32; (old.len() + 1) * width];
    for i in (0..old.len()).rev() {
        for j in (0..new.len()).rev() {
            lengths[i * width + j] = if old[i].text == new[j].text {
                lengths[(i + 1) * width + j + 1] + 1
            } else {
                lengths[(i + 1) * width + j].max(lengths[i * width + j + 1])
            };
        }
    }
    walk_ranges(old, new, &lengths)
}

fn walk_ranges(old: &[Block], new: &[Block], lengths: &[u32]) -> Vec<(Range<usize>, Range<usize>)> {
    let (mut i, mut j) = (0, 0);
    let width = new.len() + 1;
    let mut result = Vec::new();
    while i < old.len() || j < new.len() {
        if i < old.len() && j < new.len() && old[i].text == new[j].text {
            i += 1;
            j += 1;
            continue;
        }
        let (from, to) = (i, j);
        while i < old.len() || j < new.len() {
            if i < old.len() && j < new.len() && old[i].text == new[j].text {
                break;
            }
            if i < old.len()
                && (j == new.len() || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
            {
                i += 1;
            } else {
                j += 1;
            }
        }
        result.push((from..i, to..j));
    }
    result
}

fn entry(
    before: &str,
    after: &str,
    old: &[Block],
    new: &[Block],
    ranges: (Range<usize>, Range<usize>),
) -> Entry {
    let left = rewrite_blocks::range(old, before.len(), &ranges.0);
    let right = rewrite_blocks::range(new, after.len(), &ranges.1);
    let source = old.get(ranges.0.start).or_else(|| new.get(ranges.1.start));
    let original = &before[left.from as usize..left.to as usize];
    let candidate = &after[right.from as usize..right.to as usize];
    let kind = if original.is_empty() {
        "addition"
    } else if candidate.is_empty() {
        "deletion"
    } else {
        "modify"
    };
    Entry {
        title: source.map_or_else(|| "문서 변경".into(), |b| b.title.clone()),
        kind: kind.into(),
        after_range: right,
        operation: EditOperation {
            range: left,
            block_id: source.map_or_else(|| "rewrite".into(), |b| b.id.clone()),
            heading_path: source.map_or_else(Vec::new, |b| b.path.clone()),
            before: original.into(),
            after: candidate.into(),
            reason: "전체 재작성 후보의 변경입니다.".into(),
            requires_group: false,
        },
    }
}

fn whole(before: &str, after: &str, reason: &str) -> Result<Vec<PlannedUnit>, AppError> {
    let operation = EditOperation {
        range: ByteRange {
            from: 0,
            to: before.len() as u32,
        },
        block_id: "rewrite".into(),
        heading_path: Vec::new(),
        before: before.into(),
        after: after.into(),
        reason: reason.into(),
        requires_group: false,
    };
    if apply(before, std::slice::from_ref(&operation))? != after {
        return Err(invalid_patch());
    }
    Ok(vec![PlannedUnit {
        title: "문서 전체 변경".into(),
        kind: "structure".into(),
        reason: reason.into(),
        operations: vec![operation],
    }])
}
