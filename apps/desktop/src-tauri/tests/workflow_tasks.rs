mod support;
use docreview_core::{
    domain::{drafts::DraftWrite, editor::TaskSnapshot},
    storage::{Store, runtime::Runtime},
};
use serde_json::json;
use support::World;

#[test]
fn display_name_does_not_become_a_persistent_instruction() {
    let w = World::new();
    w.store.save(w.request()).unwrap();
    let task: TaskSnapshot = serde_json::from_value(json!({
        "id": w.runtime.id(), "documentId": w.document.id,
        "name": "표시 이름", "goal": "", "pinnedRules": "수치 유지", "summary": ""
    }))
    .unwrap();
    let saved = w.store.put_task(task.clone()).unwrap();
    assert_eq!(saved.goal, "");
    assert_eq!(serde_json::to_value(&saved).unwrap()["name"], "표시 이름");
    let mut value = serde_json::to_value(&saved).unwrap();
    value["name"] = json!("다른 표시 이름");
    let updated = w
        .store
        .put_task(serde_json::from_value(value).unwrap())
        .unwrap();
    assert_eq!(updated.goal, "");
    assert_eq!(updated.pinned_rules, "수치 유지");
    assert_eq!(
        std::fs::read_to_string(&w.path).unwrap(),
        support::SAVED_CONTENT
    );
}

#[test]
fn old_task_payload_keeps_its_goal_and_gets_a_display_name() {
    let w = World::new();
    let task: TaskSnapshot = serde_json::from_value(json!({
        "id": w.runtime.id(), "documentId": w.document.id,
        "goal": "기존 방향", "pinnedRules": "유지 조건", "summary": ""
    }))
    .unwrap();
    let saved = w.store.put_task(task).unwrap();
    assert_eq!(saved.goal, "기존 방향");
    assert_eq!(serde_json::to_value(saved).unwrap()["name"], "기존 방향");
}

#[test]
fn first_request_is_stored_without_a_task_and_survives_restart_with_cas() {
    let w = World::new();
    let request = DraftWrite {
        key: serde_json::to_string(&["first-request", &w.document.id, &w.runtime.id()]).unwrap(),
        schema_version: 1,
        expected_revision: 0,
        value_json: Some(
            json!({"mode":"EXPLAIN","instruction":"이 문장은 무슨 뜻인가요?"}).to_string(),
        ),
    };
    let saved = w.store.write_draft(request.clone()).unwrap();
    assert_eq!(saved.revision, 1);
    assert!(w.store.write_draft(request.clone()).is_err());
    assert!(
        w.store
            .editor_state(&w.document.id)
            .unwrap()
            .tasks
            .is_empty()
    );
    let directory = w.directory.path().join("data");
    drop(w.store);
    let store = Store::open(&directory).unwrap();
    assert_eq!(
        store.read_drafts().unwrap()[0].value_json,
        request.value_json
    );
    let mut clear = request;
    clear.expected_revision = 1;
    clear.value_json = None;
    assert_eq!(store.write_draft(clear).unwrap().revision, 2);
}

#[test]
fn first_request_rejects_unknown_documents_and_invalid_keys() {
    let w = World::new();
    let request = DraftWrite {
        key: serde_json::to_string(&["first-request", &w.runtime.id(), &w.runtime.id()]).unwrap(),
        schema_version: 1,
        expected_revision: 0,
        value_json: Some("{}".into()),
    };
    assert!(w.store.write_draft(request).is_err());
    assert!(w.store.read_drafts().unwrap().is_empty());
    assert_eq!(
        w.database()
            .query_row("SELECT count(*) FROM first_request_drafts", [], |r| r
                .get::<_, u32>(0))
            .unwrap(),
        0
    );
}
