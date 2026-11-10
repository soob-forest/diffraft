use super::{
    Store,
    errors::{database_error, lock_error},
    files, queries, review_queries,
};
use crate::{
    document::{
        patch_groups::POLICY_VERSION,
        review::{stale, valid_head},
    },
    domain::{
        document::DocumentStatus,
        error::{AppError, ErrorCode},
        review::{Decision, ReviewBatch, Validity},
        rewrite::BatchDecisionRequest,
    },
};
use rusqlite::{Connection, params};
use std::path::Path;

impl Store {
    pub fn prepare_patch_review(
        &self,
        request: BatchDecisionRequest,
    ) -> Result<ReviewBatch, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut db = self.connection()?;
        let batch = review_queries::batch(&db, &request.batch_id)?;
        if batch.document_id != request.document_id {
            return Err(stale());
        }
        if !eligible(&batch) {
            return Ok(batch);
        }
        validate_source(&db, &batch, &request)?;
        let tx = db.transaction().map_err(database_error)?;
        self.regroup_patch(&tx, &batch)?;
        self.record_patch_preparation(&tx, &batch, &request)?;
        tx.commit().map_err(database_error)?;
        review_queries::batch(&db, &batch.id)
    }

    fn record_patch_preparation(
        &self,
        db: &Connection,
        batch: &ReviewBatch,
        request: &BatchDecisionRequest,
    ) -> Result<(), AppError> {
        let current = review_queries::batch(db, &batch.id)?;
        let old = batch
            .proposals
            .iter()
            .map(|p| (&p.id, &p.group_id))
            .collect::<Vec<_>>();
        let new = current
            .proposals
            .iter()
            .map(|p| (&p.id, &p.group_id))
            .collect::<Vec<_>>();
        let payload = serde_json::to_string(&serde_json::json!({
            "request": request, "oldGroups": old, "newGroups": new,
            "oldPolicyVersion": batch.patch_review.as_ref().map(|p| p.policy_version),
            "policyVersion": current.patch_review.as_ref().map(|p| p.policy_version),
            "oldRevision": batch.patch_review.as_ref().map(|p| p.revision),
            "revision": current.patch_review.as_ref().map(|p| p.revision),
        }))
        .map_err(|_| AppError::invalid("변경 그룹 전환 기록을 저장할 수 없습니다."))?;
        db.execute("INSERT INTO decision_events(id,document_id,task_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,?4,'patch_review_prepare',?5,?6,?7)",
            params![request.operation_id,batch.document_id,batch.task_id,queries::next_sequence(db)?,payload,request.expected_head_id,self.runtime.now_ms()?])
            .map_err(database_error)?;
        Ok(())
    }
}

fn eligible(batch: &ReviewBatch) -> bool {
    batch.mode == "PATCH"
        && batch.status == "ACTIVE"
        && batch
            .patch_review
            .as_ref()
            .is_none_or(|p| p.policy_version < POLICY_VERSION)
        && batch
            .proposals
            .iter()
            .all(|p| p.decision == Decision::Pending && p.validity == Validity::Valid)
}

fn validate_source(
    db: &Connection,
    batch: &ReviewBatch,
    request: &BatchDecisionRequest,
) -> Result<(), AppError> {
    if review_queries::active_job(db)? {
        return Err(AppError::new(
            ErrorCode::Busy,
            "생성 중에는 변경 그룹을 준비할 수 없습니다.",
        ));
    }
    let head = queries::snapshot(db, &request.document_id)?;
    if head.version_id != request.expected_head_id || head.status != DocumentStatus::Ready {
        return Err(stale());
    }
    files::verify_hash(Path::new(&head.path), &head.content_hash)?;
    valid_head(&review_queries::base(db, batch)?, batch, &head)
}
