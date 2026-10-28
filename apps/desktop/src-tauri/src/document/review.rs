use super::patch::{apply, invalid_patch};
use crate::domain::{
    document::{DocumentSnapshot, DocumentStatus},
    error::{AppError, ErrorCode},
    review::{
        ByteRange, Decision, DecisionRequest, Proposal, ProposalRevision, ReviewBatch, Validity,
    },
    review_view::ReviewGroup,
};

pub fn stale() -> AppError {
    AppError::new(
        ErrorCode::StaleBase,
        "문서 또는 제안이 변경되었습니다. 최신 비교를 확인해 주세요.",
    )
}

pub fn reconstruct(base: &str, batch: &ReviewBatch, pending: bool) -> Result<String, AppError> {
    let operations: Vec<_> = batch
        .proposals
        .iter()
        .filter(|proposal| {
            proposal.decision == Decision::Accepted
                || (pending
                    && proposal.decision == Decision::Pending
                    && proposal.validity == Validity::Valid)
        })
        .map(|proposal| proposal.operation.clone())
        .collect();
    apply(base, &operations)
}

pub fn valid_head(
    base: &str,
    batch: &ReviewBatch,
    head: &DocumentSnapshot,
) -> Result<(), AppError> {
    if batch.document_id != head.id
        || batch.apply_head_id != head.version_id
        || head.status != DocumentStatus::Ready
        || batch.status != "ACTIVE"
        || reconstruct(base, batch, false)? != head.content
    {
        return Err(stale());
    }
    Ok(())
}

pub fn validate_decision<'a>(
    batch: &'a ReviewBatch,
    head: &DocumentSnapshot,
    request: &DecisionRequest,
) -> Result<Vec<&'a Proposal>, AppError> {
    request.validate()?;
    if request.batch_id != batch.id
        || request.document_id != batch.document_id
        || request.expected_head_id != head.version_id
        || batch.apply_head_id != head.version_id
        || batch.status != "ACTIVE"
    {
        return Err(stale());
    }
    let mut selected = Vec::new();
    for revision in &request.proposals {
        let proposal = batch
            .proposals
            .iter()
            .find(|p| p.id == revision.id && p.revision == revision.revision)
            .ok_or_else(stale)?;
        if proposal.decision != Decision::Pending || proposal.validity != Validity::Valid {
            return Err(stale());
        }
        selected.push(proposal);
    }
    for proposal in &batch.proposals {
        if proposal.decision == Decision::Pending
            && selected.iter().any(|p| p.group_id == proposal.group_id)
            && !selected.iter().any(|p| p.id == proposal.id)
        {
            return Err(AppError::invalid(
                "서로 의존하는 변경은 그룹 전체를 함께 결정해 주세요.",
            ));
        }
    }
    Ok(selected)
}

pub fn groups(batch: &ReviewBatch) -> Result<Vec<ReviewGroup>, AppError> {
    let mut proposals: Vec<_> = batch
        .proposals
        .iter()
        .filter(|p| matches!(p.decision, Decision::Pending | Decision::Accepted))
        .collect();
    proposals.sort_by_key(|proposal| proposal.operation.range.from);
    let mut accepted_delta = 0i64;
    let mut pending_delta = 0i64;
    let mut groups: Vec<ReviewGroup> = Vec::new();
    for proposal in proposals {
        let operation = &proposal.operation;
        let delta = operation.after.len() as i64 - operation.before.len() as i64;
        if proposal.decision == Decision::Accepted {
            accepted_delta += delta;
            continue;
        }
        let from = shift(operation.range.from, accepted_delta)?;
        let to = shift(operation.range.to, accepted_delta)?;
        let after_from = shift(from, pending_delta)?;
        let after_to = shift(after_from, operation.after.len() as i64)?;
        if !groups.iter().any(|group| group.id == proposal.group_id) {
            groups.push(empty_group(proposal));
        }
        let group = groups
            .iter_mut()
            .find(|group| group.id == proposal.group_id)
            .ok_or_else(invalid_patch)?;
        group.proposals.push(ProposalRevision {
            id: proposal.id.clone(),
            revision: proposal.revision,
        });
        group.before_ranges.push(ByteRange { from, to });
        group.after_ranges.push(ByteRange {
            from: after_from,
            to: after_to,
        });
        if proposal.validity != Validity::Valid {
            group.validity = proposal.validity;
        }
        if proposal.validity == Validity::Valid {
            pending_delta += delta;
        }
    }
    Ok(groups)
}

fn shift(offset: u32, delta: i64) -> Result<u32, AppError> {
    u32::try_from(i64::from(offset) + delta).map_err(|_| invalid_patch())
}

fn empty_group(proposal: &Proposal) -> ReviewGroup {
    ReviewGroup {
        id: proposal.group_id.clone(),
        proposals: Vec::new(),
        before_ranges: Vec::new(),
        after_ranges: Vec::new(),
        validity: proposal.validity,
    }
}
