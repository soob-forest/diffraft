#![allow(dead_code)]
use crate::fixture::UnitWorld;
use docreview_core::{domain::review::DecisionRequest, storage::runtime::Runtime};
use rusqlite::params;

pub const BEFORE: &str = "설명 [문서][my label]\n\n유지 문단\n\n[my   label]: https://example.test/old\n\n고정 문단\n\n원문 끝\n";
pub const AFTER: &str = "새 설명\n\n유지 문단\n\n고정 문단\n\n새 끝\n";

pub fn legacy() -> UnitWorld {
    legacy_with(BEFORE, AFTER)
}

pub fn legacy_with(before: &str, after: &str) -> UnitWorld {
    let w = UnitWorld::new(before, after);
    let mut batch = w.start();
    batch.proposals.sort_by_key(|p| p.operation.range.from);
    let plan = batch.review_plan.unwrap();
    let mut db = w.world.database();
    let tx = db.transaction().unwrap();
    tx.execute("DELETE FROM review_units WHERE batch_id=?1", [&batch.id])
        .unwrap();
    for (index, proposal) in batch.proposals.iter().enumerate() {
        let id = w.world.runtime.id();
        tx.execute("INSERT INTO review_units(id,batch_id,plan_id,number,title,kind,reason,review_revision) VALUES(?1,?2,?3,?4,'구형 단위','modify','구형 분리 계획',1)", params![id,batch.id,plan.id,(index+1) as u32]).unwrap();
        tx.execute(
            "UPDATE proposals SET group_id=?1 WHERE id=?2 AND batch_id=?3",
            params![id, proposal.id, batch.id],
        )
        .unwrap();
    }
    tx.execute(
        "UPDATE review_plans SET algorithm_version=1 WHERE id=?1",
        [&plan.id],
    )
    .unwrap();
    tx.commit().unwrap();
    w
}

pub fn decision(w: &UnitWorld, indices: &[usize]) -> DecisionRequest {
    let mut request = w.decision(indices[0]);
    for &index in &indices[1..] {
        request.proposals.extend(w.decision(index).proposals);
    }
    request
}

pub fn version(w: &UnitWorld, algorithm: u32) {
    w.world
        .database()
        .execute(
            "UPDATE review_plans SET algorithm_version=?1 WHERE batch_id=?2",
            params![algorithm, w.batch.id],
        )
        .unwrap();
}

pub fn save_count(w: &UnitWorld) -> u32 {
    w.world
        .database()
        .query_row("SELECT COUNT(*) FROM save_operations", [], |row| row.get(0))
        .unwrap()
}
