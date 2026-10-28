use crate::{support::World, world::add_task};
use docreview_core::{
    domain::{
        ai::AiResponse,
        document::DocumentSnapshot,
        editor::ScopeSelection,
        review::{ReviewBatch, ReviewJob},
        rewrite::BatchDecisionRequest,
    },
    storage::{review_jobs::BeginReviewJob, runtime::Runtime},
};

pub const CONFIRMED: &str = include_str!("../../../../../docs/examples/confirmed_v14.md");
pub const REWRITE: &str = include_str!("../../../../../docs/examples/rewrite_W02.md");

pub struct RewriteWorld {
    pub world: World,
    pub head: DocumentSnapshot,
    pub task: String,
    pub batch: ReviewBatch,
}

impl RewriteWorld {
    pub fn new() -> Self {
        let world = World::new();
        let mut head = world.document.clone();
        for _ in 1..14 {
            let mut request = world.request();
            request.expected_version = head.version;
            request.content = CONFIRMED.into();
            head = world.store.save(request).unwrap();
        }
        let task = add_task(&world, &head.id);
        let job = begin(&world, &head, &task);
        let batch = world
            .store
            .register_rewrite(&job, &response(REWRITE))
            .unwrap();
        Self {
            world,
            head,
            task,
            batch,
        }
    }

    pub fn request(&self) -> BatchDecisionRequest {
        BatchDecisionRequest {
            document_id: self.head.id.clone(),
            batch_id: self.batch.id.clone(),
            expected_head_id: self.head.version_id.clone(),
            operation_id: self.world.runtime.id(),
        }
    }

    pub fn begin(&self) -> ReviewJob {
        begin(&self.world, &self.head, &self.task)
    }
}

fn begin(world: &World, head: &DocumentSnapshot, task: &str) -> ReviewJob {
    world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: head.id.clone(),
            task_id: task.into(),
            expected_version: head.version,
            selection: ScopeSelection::Whole,
        })
        .unwrap()
}

pub fn response(content: &str) -> AiResponse {
    AiResponse::Rewrite {
        schema_version: 1,
        summary: "W02".into(),
        candidate_markdown: content.into(),
    }
}
