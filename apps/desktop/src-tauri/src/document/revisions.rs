use super::{
    patch::{invalid_patch, validate_patch},
    review::{reconstruct, stale},
};
use crate::domain::{
    SCHEMA_VERSION,
    ai::{AiChange, AiResponse},
    annotations::RevisionRequest,
    editor::ScopeSnapshot,
    error::AppError,
    review::{Decision, Proposal, ReviewBatch, Validity},
};

pub fn revise(
    base: &str,
    scope: &ScopeSnapshot,
    batch: &mut ReviewBatch,
    request: &RevisionRequest,
) -> Result<Proposal, AppError> {
    let proposal = batch
        .proposals
        .iter_mut()
        .find(|p| p.id == request.proposal_id && p.revision == request.expected_revision)
        .ok_or_else(stale)?;
    if proposal.decision != Decision::Pending || proposal.validity != Validity::Valid {
        return Err(stale());
    }
    let response = AiResponse::Patch {
        schema_version: SCHEMA_VERSION,
        summary: String::new(),
        changes: vec![AiChange {
            block_id: proposal.operation.block_id.clone(),
            before: proposal.operation.before.clone(),
            after: request.after.clone(),
            reason: proposal.operation.reason.clone(),
        }],
    };
    let mut operations = validate_patch(base, scope, &response)?;
    if operations.is_empty() {
        return Err(AppError::invalid(
            "원문과 같은 내용입니다. 변경을 없애려면 제안을 거절하거나 취소해 주세요.",
        ));
    }
    let operation = operations.pop().ok_or_else(invalid_patch)?;
    if operation.range != proposal.operation.range {
        return Err(invalid_patch());
    }
    proposal.operation = operation;
    proposal.revision = proposal
        .revision
        .checked_add(1)
        .ok_or_else(|| AppError::invalid("제안 revision 한도를 초과했습니다."))?;
    let revised = proposal.clone();
    reconstruct(base, batch, true)?;
    Ok(revised)
}
