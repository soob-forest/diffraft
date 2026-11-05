use super::unit_review_queries::invalid_plan;
use crate::{
    document::rewrite_references::dependencies,
    domain::{
        error::AppError,
        review::{ByteRange, Decision, DecisionRequest, ReviewBatch},
    },
};
use std::collections::HashSet;

const LEGACY_ALGORITHM_VERSION: u32 = 1;

pub(super) fn validate(
    base: &str,
    batch: &ReviewBatch,
    request: &DecisionRequest,
) -> Result<(), AppError> {
    if !batch.is_unit_review()
        || batch
            .review_plan
            .as_ref()
            .is_none_or(|plan| plan.algorithm_version != LEGACY_ALGORITHM_VERSION)
    {
        return Ok(());
    }
    let candidate = batch
        .candidate_markdown
        .as_deref()
        .ok_or_else(invalid_plan)?;
    let before = batch
        .proposals
        .iter()
        .map(|proposal| proposal.operation.range.clone())
        .collect::<Vec<_>>();
    let after = candidate_ranges(batch)?;
    let edges = dependencies(base, &before)
        .into_iter()
        .chain(dependencies(candidate, &after));
    let mut parents = (0..batch.proposals.len()).collect::<Vec<_>>();
    for (left, right) in edges {
        let left = root(&parents, left);
        let right = root(&parents, right);
        parents[left.max(right)] = left.min(right);
    }
    validate_components(batch, request, &parents)
}

fn candidate_ranges(batch: &ReviewBatch) -> Result<Vec<ByteRange>, AppError> {
    let mut ordered = batch.proposals.iter().enumerate().collect::<Vec<_>>();
    ordered.sort_by_key(|(_, proposal)| proposal.operation.range.from);
    let mut ranges = vec![ByteRange { from: 0, to: 0 }; batch.proposals.len()];
    let mut delta = 0i64;
    for (index, proposal) in ordered {
        let operation = &proposal.operation;
        let width = operation
            .range
            .to
            .checked_sub(operation.range.from)
            .ok_or_else(invalid_plan)?;
        let size = u32::try_from(operation.after.len()).map_err(|_| invalid_plan())?;
        let from =
            u32::try_from(i64::from(operation.range.from) + delta).map_err(|_| invalid_plan())?;
        let to = from.checked_add(size).ok_or_else(invalid_plan)?;
        ranges[index] = ByteRange { from, to };
        delta += i64::from(size) - i64::from(width);
    }
    Ok(ranges)
}

fn validate_components(
    batch: &ReviewBatch,
    request: &DecisionRequest,
    parents: &[usize],
) -> Result<(), AppError> {
    let selected = batch
        .proposals
        .iter()
        .map(|proposal| {
            request
                .proposals
                .iter()
                .any(|target| target.id == proposal.id)
        })
        .collect::<Vec<_>>();
    let touched = selected
        .iter()
        .enumerate()
        .filter(|(_, included)| **included)
        .map(|(index, _)| root(parents, index))
        .collect::<HashSet<_>>();
    for (index, proposal) in batch.proposals.iter().enumerate() {
        if touched.contains(&root(parents, index))
            && !selected[index]
            && proposal.decision != Decision::Accepted
        {
            return Err(AppError::invalid(
                "이전 검토 계획의 참조가 연결된 변경을 함께 승인해 주세요. 거절한 관련 변경은 다시 검토한 뒤 승인할 수 있습니다.",
            ));
        }
    }
    Ok(())
}

fn root(parents: &[usize], mut index: usize) -> usize {
    while parents[index] != index {
        index = parents[index];
    }
    index
}
