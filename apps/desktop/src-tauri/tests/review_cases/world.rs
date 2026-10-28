use crate::support::World;
use docreview_core::{
    domain::{
        ai::{AiChange, AiResponse},
        document::DocumentSnapshot,
        editor::{ScopeSelection, TaskSnapshot},
        review::{DecisionRequest, ProposalRevision, ReviewBatch},
    },
    storage::{review_jobs::BeginReviewJob, runtime::Runtime},
};

pub const BASE: &str = include_str!("../../../../../docs/examples/base_v12.md");
pub const CANDIDATE: &str = include_str!("../../../../../docs/examples/proposal_B01.md");

pub struct ReviewWorld {
    pub world: World,
    pub head: DocumentSnapshot,
    pub task: String,
    pub batch: ReviewBatch,
}

impl ReviewWorld {
    pub fn new() -> Self {
        let world = World::new();
        let mut head = world.document.clone();
        for _ in 1..12 {
            let mut request = world.request();
            request.expected_version = head.version;
            request.content = BASE.into();
            head = world.store.save(request).unwrap();
        }
        let task = add_task(&world, &head.id);
        let batch = register(&world, &head, &task, &response());
        Self {
            world,
            head,
            task,
            batch,
        }
    }

    pub fn request(&self, indices: &[usize]) -> DecisionRequest {
        DecisionRequest {
            document_id: self.head.id.clone(),
            batch_id: self.batch.id.clone(),
            expected_head_id: self.head.version_id.clone(),
            proposals: indices
                .iter()
                .map(|index| {
                    let proposal = &self.batch.proposals[*index];
                    ProposalRevision {
                        id: proposal.id.clone(),
                        revision: proposal.revision,
                    }
                })
                .collect(),
            operation_id: self.world.runtime.id(),
        }
    }
}

pub fn add_task(world: &World, document: &str) -> String {
    let task = world
        .store
        .put_task(TaskSnapshot {
            id: world.runtime.id(),
            document_id: document.into(),
            goal: "여행 안내 검토".into(),
            pinned_rules: "확인 시간 유지".into(),
            summary: String::new(),
        })
        .unwrap();
    task.id
}

pub fn register(
    world: &World,
    head: &DocumentSnapshot,
    task: &str,
    response: &AiResponse,
) -> ReviewBatch {
    let job = world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: head.id.clone(),
            task_id: task.into(),
            expected_version: head.version,
            selection: ScopeSelection::Whole,
        })
        .unwrap();
    world.store.register_patch(&job, response).unwrap()
}

pub fn response() -> AiResponse {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../../../docs/examples/proposals.json")).unwrap();
    let changes = fixture["changes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| AiChange {
            block_id: format!("b{}", value["line"].as_u64().unwrap()),
            before: value["before"].as_str().unwrap().into(),
            after: value["after"].as_str().unwrap().into(),
            reason: value["name"].as_str().unwrap().into(),
        })
        .collect();
    AiResponse::Patch {
        schema_version: 1,
        summary: "B01".into(),
        changes,
    }
}
