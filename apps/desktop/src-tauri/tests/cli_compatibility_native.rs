use docreview_core::{
    claude_adapter::{
        connection, diagnostics, environment, execution::CliLauncher, generation, process_lease,
        settings,
    },
    domain::{
        ai::ResponseMode,
        connection::ConnectionStatus,
        editor::{ScopeSelection, TaskSnapshot},
        generation::{GenerateRequest, GenerationOutcome},
    },
    storage::Store,
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
};

fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}
fn selected_cli() -> PathBuf {
    std::env::var_os("DOCREVIEW_TEST_CLI")
        .expect("explicit isolated CLI path")
        .into()
}

#[test]
#[ignore = "실제 계정·최소 요청을 사용하는 명시 실행 전용 CLI 버전 검사."]
fn selected_cli_connects_and_reports_its_actual_version() {
    let directory = tempfile::tempdir().unwrap();
    let path = selected_cli();
    let inspected =
        diagnostics::inspect(&path, directory.path(), &environment::current().unwrap()).unwrap();
    assert_eq!(inspected.status, ConnectionStatus::Ready);
    settings::save(directory.path(), &path).unwrap();
    let tested = connection::test(directory.path(), &id(), flag()).unwrap();
    assert_eq!(tested.status, ConnectionStatus::Ready);
    assert_eq!(tested.version, inspected.version);
    process_lease::require_clear(directory.path()).unwrap();
    println!(
        "official_connection=passed actual_version={}",
        tested.version.unwrap()
    );
}

fn explain(store: &Store, task: &str) {
    let head = store.documents().unwrap().remove(0);
    let head = store.snapshot(&head.id).unwrap();
    let result = generation::execute(
        store,
        &CliLauncher::Installed,
        GenerateRequest {
            model: Default::default(),
            document_id: head.id,
            task_id: task.into(),
            expected_head_id: head.version_id,
            operation_id: id(),
            mode: ResponseMode::Explain,
            selection: ScopeSelection::Whole,
            instruction: "Return the single word CONNECTED. No changes.".into(),
            expected_active_batch_id: None,
            archive_previous: false,
            retry_of: None,
        },
        flag(),
    )
    .unwrap();
    assert!(matches!(result, GenerationOutcome::Explain(_)));
}

fn synthetic_store(directory: &Path) -> (Store, String, PathBuf) {
    let data = directory.join("data");
    let path = directory.join("synthetic.md");
    fs::write(&path, "# Synthetic compatibility check\n").unwrap();
    let store = Store::open(&data).unwrap();
    let document = store.open_document(&path).unwrap();
    let task = store
        .put_task(TaskSnapshot {
            id: id(),
            document_id: document.id,
            goal: "Compatibility".into(),
            pinned_rules: "Do not change the document".into(),
            summary: String::new(),
        })
        .unwrap();
    (store, task.id, path)
}

#[test]
#[ignore = "실제 계정·합성 문서와 두 버전의 명시적 세션 재개 검사."]
fn current_cli_resumes_a_session_created_by_the_minimum_cli() {
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let (store, task, path) = synthetic_store(directory.path());
    settings::save(&data, &selected_cli()).unwrap();
    explain(&store, &task);
    let before = store.active_session(&task).unwrap().unwrap();
    drop(store);
    let store = Store::open(&data).unwrap();
    let current = PathBuf::from(
        std::env::var_os("DOCREVIEW_CURRENT_CLI").expect("explicit current CLI path"),
    );
    let inspected =
        diagnostics::inspect(&current, &data, &environment::current().unwrap()).unwrap();
    settings::save(&data, &current).unwrap();
    explain(&store, &task);
    let after = store.active_session(&task).unwrap().unwrap();
    assert_eq!(before.session_id, after.session_id);
    assert_ne!(before.cli_version, after.cli_version);
    assert_eq!(Some(after.cli_version.clone()), inspected.version);
    assert_eq!(
        store.task_conversation(&task, None).unwrap().messages.len(),
        4
    );
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "# Synthetic compatibility check\n"
    );
    process_lease::require_clear(&data).unwrap();
    println!(
        "official_upgrade_resume=passed from={} to={} session_preserved=true",
        before.cli_version, after.cli_version
    );
}
