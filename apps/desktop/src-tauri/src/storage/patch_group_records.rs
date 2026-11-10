use super::{Store, errors::database_error, review_queries};
use crate::{
    document::patch_groups::{POLICY_VERSION, PatchGroup, plan},
    domain::{
        error::AppError,
        review::{Decision, PatchReview, ReviewBatch},
    },
};
use rusqlite::{Connection, OptionalExtension, params};
use std::collections::BTreeMap;

pub(super) fn attach(db: &Connection, batch: &mut ReviewBatch) -> Result<(), AppError> {
    let row: Option<(u32, u32, String)> = db
        .query_row(
            "SELECT policy_version,revision,reasons_json FROM patch_reviews WHERE batch_id=?1",
            [&batch.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(database_error)?;
    batch.patch_review = row
        .map(|(policy_version, revision, json)| {
            let reasons = serde_json::from_str(&json)
                .map_err(|_| AppError::invalid("변경 그룹 기록을 읽을 수 없습니다."))?;
            Ok(PatchReview {
                policy_version,
                revision,
                reasons,
            })
        })
        .transpose()?;
    Ok(())
}

impl Store {
    pub(super) fn regroup_patch(
        &self,
        db: &Connection,
        batch: &ReviewBatch,
    ) -> Result<(), AppError> {
        if batch.mode != "PATCH" {
            return Ok(());
        }
        let base = review_queries::base(db, batch)?;
        let operations = batch
            .proposals
            .iter()
            .map(|p| p.operation.clone())
            .collect::<Vec<_>>();
        let groups = plan(&base, &operations)?;
        let mut reasons = BTreeMap::new();
        for group in groups {
            if !group
                .members
                .iter()
                .any(|&i| batch.proposals[i].decision == Decision::Pending)
            {
                continue;
            }
            validate_decided_members(batch, &group)?;
            let id = preserved_group(batch, &group).unwrap_or_else(|| self.runtime.id());
            for i in group.members {
                let p = &batch.proposals[i];
                if p.decision == Decision::Pending {
                    db.execute("UPDATE proposals SET group_id=?1 WHERE batch_id=?2 AND id=?3 AND revision=?4 AND decision='PENDING'",
                        params![id,batch.id,p.id,p.revision]).map_err(database_error)?;
                }
            }
            reasons.insert(id, group.reason);
        }
        let revision = batch
            .patch_review
            .as_ref()
            .map_or(0, |p| p.revision)
            .checked_add(1)
            .ok_or_else(|| AppError::invalid("변경 그룹 검토 회차 한도를 초과했습니다."))?;
        let json = serde_json::to_string(&reasons)
            .map_err(|_| AppError::invalid("변경 그룹을 저장할 수 없습니다."))?;
        db.execute("INSERT INTO patch_reviews(batch_id,policy_version,revision,reasons_json) VALUES(?1,?2,?3,?4) ON CONFLICT(batch_id) DO UPDATE SET policy_version=excluded.policy_version,revision=excluded.revision,reasons_json=excluded.reasons_json",
            params![batch.id,POLICY_VERSION,revision,json]).map_err(database_error)?;
        Ok(())
    }
}

fn validate_decided_members(batch: &ReviewBatch, group: &PatchGroup) -> Result<(), AppError> {
    if group.members.iter().any(|&i| {
        matches!(
            batch.proposals[i].decision,
            Decision::Rejected | Decision::Discarded
        )
    }) {
        return Err(AppError::invalid(
            "거절한 변경과 함께 적용해야 하는 수정입니다. 확정본에서 새 요청을 작성해 주세요.",
        ));
    }
    Ok(())
}

fn preserved_group(batch: &ReviewBatch, group: &PatchGroup) -> Option<String> {
    let pending = group
        .members
        .iter()
        .map(|&i| &batch.proposals[i])
        .filter(|p| p.decision == Decision::Pending)
        .collect::<Vec<_>>();
    let first = pending.first()?;
    let original_count = batch
        .proposals
        .iter()
        .filter(|p| p.decision == Decision::Pending && p.group_id == first.group_id)
        .count();
    (original_count == pending.len() && pending.iter().all(|p| p.group_id == first.group_id))
        .then(|| first.group_id.clone())
}
