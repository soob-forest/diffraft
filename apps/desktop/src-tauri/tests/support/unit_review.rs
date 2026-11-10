#![allow(dead_code)]
use crate::support::World;
use docreview_core::{
    domain::{
        ai::AiResponse,
        document::DocumentSnapshot,
        editor::{ScopeSelection, TaskSnapshot},
        review::{DecisionRequest, ReviewBatch},
        unit_review::{AddUnitComment, ReopenUnitReview, StartRewriteReview},
    },
    storage::{files, review_jobs::BeginReviewJob, runtime::Runtime},
};

pub struct UnitWorld {
    pub world: World,
    pub head: DocumentSnapshot,
    pub task: String,
    pub batch: ReviewBatch,
}

impl UnitWorld {
    pub fn new(before: &str, after: &str) -> Self {
        let world = World::new();
        let mut save = world.request();
        save.content = before.into();
        let head = world.store.save(save).unwrap();
        let task = world.runtime.id();
        world
            .store
            .put_task(TaskSnapshot {
                name: None,
                id: task.clone(),
                document_id: head.id.clone(),
                goal: "전체 재작성 검토".into(),
                pinned_rules: String::new(),
                summary: String::new(),
            })
            .unwrap();
        let job = world
            .store
            .begin_review_job(BeginReviewJob {
                document_id: head.id.clone(),
                task_id: task.clone(),
                expected_version: head.version,
                selection: ScopeSelection::Whole,
            })
            .unwrap();
        let batch = world
            .store
            .register_rewrite(
                &job,
                &AiResponse::Rewrite {
                    schema_version: 1,
                    summary: "단위 검토".into(),
                    candidate_markdown: after.into(),
                },
            )
            .unwrap();
        Self {
            world,
            head,
            task,
            batch,
        }
    }

    pub fn source() -> Self {
        Self::new("첫 문단\n\n둘 문단\n", "첫 수정\n\n둘 수정\n")
    }

    pub fn start_request(&self) -> StartRewriteReview {
        StartRewriteReview {
            document_id: self.head.id.clone(),
            batch_id: self.batch.id.clone(),
            expected_head_id: self.head.version_id.clone(),
            candidate_hash: files::content_hash(self.batch.candidate_markdown.as_ref().unwrap()),
            operation_id: self.world.runtime.id(),
        }
    }

    pub fn start(&self) -> ReviewBatch {
        self.world
            .store
            .start_rewrite_review(self.start_request())
            .unwrap()
    }
    pub fn current(&self) -> ReviewBatch {
        self.world.store.review_batch(&self.batch.id).unwrap()
    }

    pub fn decision(&self, index: usize) -> DecisionRequest {
        DecisionRequest {
            expected_group_revision: None,
            document_id: self.head.id.clone(),
            batch_id: self.batch.id.clone(),
            expected_head_id: self.world.store.snapshot(&self.head.id).unwrap().version_id,
            proposals: self.current().review_units[index].proposals.clone(),
            operation_id: self.world.runtime.id(),
        }
    }

    pub fn reopen(&self, index: usize) -> ReopenUnitReview {
        let batch = self.current();
        let unit = &batch.review_units[index];
        ReopenUnitReview {
            document_id: self.head.id.clone(),
            batch_id: batch.id,
            plan_id: unit.plan_id.clone(),
            unit_id: unit.id.clone(),
            expected_head_id: self.world.store.snapshot(&self.head.id).unwrap().version_id,
            expected_review_revision: unit.review_revision,
            operation_id: self.world.runtime.id(),
        }
    }

    pub fn comment(&self, index: usize, text: &str) -> AddUnitComment {
        let batch = self.current();
        let unit = &batch.review_units[index];
        AddUnitComment {
            id: self.world.runtime.id(),
            batch_id: batch.id,
            plan_id: unit.plan_id.clone(),
            unit_id: unit.id.clone(),
            text: text.into(),
        }
    }
}
