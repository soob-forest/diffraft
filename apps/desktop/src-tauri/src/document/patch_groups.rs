use super::{
    patch::{apply, invalid_patch},
    patch_moves, patch_structure, rewrite_references,
};
use crate::domain::{
    ai::MAX_CHANGES,
    error::AppError,
    review::{ByteRange, EditOperation},
};

pub const POLICY_VERSION: u32 = 3;
const INDEPENDENT: &str = "독립적으로 검토할 수 있는 변경입니다.";
const REFERENCE: &str = "참조 정의와 연결된 변경을 함께 적용합니다.";

#[derive(Debug, PartialEq, Eq)]
pub struct PatchGroup {
    pub members: Vec<usize>,
    pub reason: String,
}

pub fn plan(base: &str, operations: &[EditOperation]) -> Result<Vec<PatchGroup>, AppError> {
    if operations.len() > MAX_CHANGES {
        return Err(invalid_patch());
    }
    let candidate = apply(base, operations)?;
    let before = operations
        .iter()
        .map(|op| op.range.clone())
        .collect::<Vec<_>>();
    let after = candidate_ranges(operations)?;
    let mut edges = Vec::new();
    for (text, ranges) in [(base, &before), (candidate.as_str(), &after)] {
        edges.extend(
            rewrite_references::dependencies(text, ranges)
                .into_iter()
                .map(|(a, b)| (a, b, REFERENCE)),
        );
    }
    edges.extend(patch_moves::edges(base, &candidate, operations, &after));
    edges.extend(patch_structure::edges(
        base, &candidate, operations, &after,
    )?);
    Ok(assemble(operations, &edges))
}

pub fn candidate_ranges(operations: &[EditOperation]) -> Result<Vec<ByteRange>, AppError> {
    let mut ordered = operations.iter().enumerate().collect::<Vec<_>>();
    ordered.sort_by_key(|(_, op)| op.range.from);
    let mut ranges = vec![ByteRange { from: 0, to: 0 }; operations.len()];
    let mut delta = 0i64;
    for (i, op) in ordered {
        let from = u32::try_from(i64::from(op.range.from) + delta).map_err(|_| invalid_patch())?;
        let size = u32::try_from(op.after.len()).map_err(|_| invalid_patch())?;
        ranges[i] = ByteRange {
            from,
            to: from.checked_add(size).ok_or_else(invalid_patch)?,
        };
        delta += i64::from(size)
            - i64::from(
                op.range
                    .to
                    .checked_sub(op.range.from)
                    .ok_or_else(invalid_patch)?,
            );
    }
    Ok(ranges)
}

fn root(parents: &[usize], mut i: usize) -> usize {
    while parents[i] != i {
        i = parents[i];
    }
    i
}

fn assemble(ops: &[EditOperation], edges: &[(usize, usize, &str)]) -> Vec<PatchGroup> {
    let mut parents = (0..ops.len()).collect::<Vec<_>>();
    for &(a, b, _) in edges {
        let left = root(&parents, a);
        let right = root(&parents, b);
        parents[left.max(right)] = left.min(right);
    }
    let mut groups = Vec::new();
    for i in 0..ops.len() {
        if root(&parents, i) != i {
            continue;
        }
        let members = (0..ops.len()).filter(|&j| root(&parents, j) == i).collect();
        let reasons = edges
            .iter()
            .filter(|(a, _, _)| root(&parents, *a) == i)
            .map(|(_, _, reason)| *reason)
            .collect::<std::collections::BTreeSet<_>>();
        let reason = if reasons.is_empty() {
            INDEPENDENT.into()
        } else {
            reasons.into_iter().collect::<Vec<_>>().join(" ")
        };
        groups.push(PatchGroup { members, reason });
    }
    groups.sort_by_key(|g| g.members.iter().map(|&i| ops[i].range.from).min());
    groups
}
