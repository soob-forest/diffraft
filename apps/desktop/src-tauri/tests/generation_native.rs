use docreview_core::{
    claude_adapter::{execution::CliLauncher, generation, process_lease, regeneration},
    domain::{
        ai::ResponseMode,
        document::DocumentSnapshot,
        editor::{ScopeSelection, TaskSnapshot},
        generation::{GenerateRequest, GenerationOutcome},
        history::RestoreRequest,
        regeneration::RegenerateRequest,
        review::{DecisionRequest, ProposalRevision, ReviewBatch},
    },
    storage::Store,
};
use std::{
    fs,
    sync::{Arc, atomic::AtomicBool},
};

const ORIGINAL: &str = "# 합성 검증\n\n이 문서는 초안입니다.\n";
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 합성 문서 생성·재개 검사. 별도 명시 실행 전용."]
fn official_cli_generates_regenerates_and_resumes_after_restart_and_restore() {
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let path = directory.path().join("synthetic.md");
    fs::write(&path, ORIGINAL).unwrap();
    let store = Store::open(&data).unwrap();
    let head = store.open_document(&path).unwrap();
    let task = create_task(&store, &head.id);
    let batch = create_patch(&store, &head, &task);
    let session = store.active_session(&task).unwrap().unwrap().session_id;
    let revised = revise_patch(&store, &head, &batch);
    assert_eq!(
        store.active_session(&task).unwrap().unwrap().session_id,
        session
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), ORIGINAL);
    let accepted = accept(&store, &head, &revised);
    drop(store);
    let store = Store::open(&data).unwrap();
    let restored = store
        .restore_version(RestoreRequest {
            document_id: head.id.clone(),
            expected_head_id: accepted.version_id,
            target_version_id: head.version_id,
            operation_id: id(),
        })
        .unwrap();
    assert_eq!(restored.content, ORIGINAL);
    explain_restored(&store, &restored, &task, &batch.id);
    assert_eq!(
        store.active_session(&task).unwrap().unwrap().session_id,
        session
    );
    assert_eq!(
        store.task_conversation(&task, None).unwrap().messages.len(),
        6
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), ORIGINAL);
    process_lease::require_clear(&data).unwrap();
    println!("official_generation_resume_restore=passed requests=3 session_preserved=true");
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 빈 문서 초안 작성·승인 검사. 별도 명시 실행 전용."]
fn official_cli_drafts_an_empty_document_without_writing_before_approval() {
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let path = directory.path().join("empty.md");
    fs::write(&path, "").unwrap();
    let store = Store::open(&data).unwrap();
    let head = store.open_document(&path).unwrap();
    let task = create_task(&store, &head.id);
    let mut draft = request(&head, &task, ResponseMode::Patch);
    draft.instruction =
        "비어 있는 문서에 로컬 문서 검토 도구의 목적과 사용 방법을 짧게 작성해 주세요.".into();
    let result = generation::execute(&store, &CliLauncher::Installed, draft, flag()).unwrap();
    let GenerationOutcome::Patch(batch) = result else {
        panic!("expected draft PATCH")
    };
    assert!(!batch.proposals.is_empty());
    assert!(
        batch
            .proposals
            .iter()
            .any(|proposal| !proposal.operation.after.is_empty())
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "");
    let accepted = accept(&store, &head, &batch);
    assert!(!accepted.content.is_empty());
    assert_eq!(fs::read_to_string(&path).unwrap(), accepted.content);
    assert_eq!(
        store.task_conversation(&task, None).unwrap().messages.len(),
        2
    );
    process_lease::require_clear(&data).unwrap();
    println!(
        "official_empty_draft=passed requests=1 unapproved_file_unchanged=true approved_file_matches=true"
    );
}

fn create_task(store: &Store, document: &str) -> String {
    store
        .put_task(TaskSnapshot {
            id: id(),
            document_id: document.into(),
            goal: "합성 문서 검증".into(),
            pinned_rules: "제목과 줄바꿈은 그대로 유지".into(),
            summary: String::new(),
        })
        .unwrap()
        .id
}
fn request(head: &DocumentSnapshot, task: &str, mode: ResponseMode) -> GenerateRequest {
    GenerateRequest {
        model: Default::default(),
        document_id: head.id.clone(), task_id: task.into(), expected_head_id: head.version_id.clone(),
        operation_id: id(), mode, selection: ScopeSelection::Whole,
        instruction: "본문의 초안 단어만 검토안으로 바꾸세요. changes는 정확히 하나이고 제목은 변경하지 마세요.".into(),
        expected_active_batch_id: None, archive_previous: false, retry_of: None,
    }
}
fn create_patch(store: &Store, head: &DocumentSnapshot, task: &str) -> ReviewBatch {
    let outcome = generation::execute(
        store,
        &CliLauncher::Installed,
        request(head, task, ResponseMode::Patch),
        flag(),
    )
    .unwrap();
    let GenerationOutcome::Patch(batch) = outcome else {
        panic!("expected PATCH")
    };
    assert_eq!(batch.proposals.len(), 1);
    assert!(batch.proposals[0].operation.after.contains("검토안"));
    *batch
}
fn revise_patch(store: &Store, head: &DocumentSnapshot, batch: &ReviewBatch) -> ReviewBatch {
    let proposal = &batch.proposals[0];
    let request = RegenerateRequest {
        model: Default::default(),
        document_id: head.id.clone(), batch_id: batch.id.clone(), proposal_id: proposal.id.clone(),
        expected_revision: proposal.revision, expected_head_id: head.version_id.clone(),
        operation_id: id(), instruction: "같은 원문에 대해 검토안을 최종 검토안으로 바꾸는 후보 하나만 반환하세요. 원문 before는 제공한 target.operation.before와 같아야 합니다.".into(), retry_of: None,
    };
    let revised = regeneration::execute(store, &CliLauncher::Installed, request, flag()).unwrap();
    assert_eq!(revised.proposals[0].revision, 2);
    assert!(revised.proposals[0].operation.after.contains("최종 검토안"));
    revised
}
fn accept(store: &Store, head: &DocumentSnapshot, batch: &ReviewBatch) -> DocumentSnapshot {
    store
        .accept_proposals(DecisionRequest {
            document_id: head.id.clone(),
            batch_id: batch.id.clone(),
            expected_head_id: head.version_id.clone(),
            proposals: batch
                .proposals
                .iter()
                .map(|value| ProposalRevision {
                    id: value.id.clone(),
                    revision: value.revision,
                })
                .collect(),
            operation_id: id(),
        })
        .unwrap()
}
fn explain_restored(store: &Store, head: &DocumentSnapshot, task: &str, batch: &str) {
    let mut request = request(head, task, ResponseMode::Explain);
    request.expected_active_batch_id = Some(batch.into());
    request.instruction = "현재 confirmed.version 번호와 scope.text의 본문 문장을 그대로 답하세요. 로컬 decisions의 restore 이벤트를 확인했다면 RESTORE_OK를 붙이세요. 이전 후보 대신 현재 확정본만 사용하세요.".into();
    let result = generation::execute(store, &CliLauncher::Installed, request, flag()).unwrap();
    let GenerationOutcome::Explain(answer) = result else {
        panic!("expected EXPLAIN")
    };
    assert!(answer.contains("RESTORE_OK"));
    assert!(answer.contains("이 문서는 초안입니다."));
    assert!(answer.contains(&head.version.to_string()));
}
