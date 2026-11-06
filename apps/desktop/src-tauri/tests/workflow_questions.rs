#[path = "support/unit_review.rs"]
mod fixture;
mod support;
use docreview_core::{
    commands::review,
    domain::{generation::GenerateRequest, review_api::ReviewRequest},
    storage::runtime::Runtime,
};
use fixture::UnitWorld;
use serde_json::{Value, json};

fn question(w: &UnitWorld) -> Value {
    let batch = w.start();
    let unit = &batch.review_units[0];
    let input: ReviewRequest = serde_json::from_value(json!({"schemaVersion":1,"action":{
        "kind":"prepare_question","request":{
            "documentId":w.head.id,"taskId":w.task,"batchId":w.batch.id,
            "expectedHeadId":w.head.version_id,
            "subject":{"kind":"unit","id":unit.id,"revision":unit.review_revision}
        }
    }}))
    .unwrap();
    serde_json::to_value(review::dispatch(&w.world.store, input).unwrap()).unwrap()["value"].clone()
}
fn request(w: &UnitWorld, target: Value) -> GenerateRequest {
    serde_json::from_value(json!({
        "documentId":w.head.id,"taskId":w.task,"expectedHeadId":w.head.version_id,
        "operationId":w.world.runtime.id(),"mode":"EXPLAIN","selection":{"kind":"whole"},
        "instruction":"왜 이렇게 바꿨나요?","question":target,
        "expectedActiveBatchId":w.batch.id,"archivePrevious":false,"retryOf":null
    }))
    .unwrap()
}
#[test]
fn unit_question_pins_the_actual_change_without_mutating_source_or_decisions() {
    let w = UnitWorld::source();
    let target = question(&w);
    let before = serde_json::to_value(w.current()).unwrap();
    let job = w
        .world
        .store
        .begin_generation(request(&w, target.clone()))
        .unwrap();
    let context: Value =
        serde_json::from_str(&w.world.store.generation_context(&job).unwrap()).unwrap();
    assert_eq!(context["questionTarget"], target);
    assert_eq!(
        context["questionTarget"]["changes"][0]["before"],
        "첫 문단\n\n"
    );
    assert!(context["scope"]["blocks"].as_array().unwrap().is_empty());
    assert_eq!(serde_json::to_value(w.current()).unwrap(), before);
    assert_eq!(
        w.world.store.snapshot(&w.head.id).unwrap().content,
        w.head.content
    );
}
#[test]
fn altered_question_or_wrong_mode_is_rejected_without_starting_a_job() {
    let w = UnitWorld::source();
    let mut target = question(&w);
    target["changes"][0]["after"] = json!("조작한 후보");
    assert!(w.world.store.begin_generation(request(&w, target)).is_err());
    let mut input = request(&w, question_again(&w));
    input.mode = docreview_core::domain::ai::ResponseMode::Patch;
    assert!(w.world.store.begin_generation(input).is_err());
    assert_eq!(
        w.world
            .database()
            .query_row(
                "SELECT count(*) FROM jobs WHERE status='RUNNING'",
                [],
                |r| r.get::<_, u32>(0)
            )
            .unwrap(),
        0
    );
}
fn question_again(w: &UnitWorld) -> Value {
    let unit = &w.current().review_units[0];
    let input: ReviewRequest = serde_json::from_value(json!({"schemaVersion":1,"action":{
        "kind":"prepare_question","request":{"documentId":w.head.id,"taskId":w.task,
        "batchId":w.batch.id,"expectedHeadId":w.head.version_id,
        "subject":{"kind":"unit","id":unit.id,"revision":unit.review_revision}}
    }}))
    .unwrap();
    serde_json::to_value(review::dispatch(&w.world.store, input).unwrap()).unwrap()["value"].clone()
}

#[test]
fn both_fake_providers_receive_the_same_pinned_change_and_store_its_answer_target() {
    for codex in [false, true] {
        let w = UnitWorld::source();
        let target = question(&w);
        let before = serde_json::to_value(w.current()).unwrap();
        execute_question(&w, &target, codex);
        assert_eq!(
            std::fs::read_to_string(w.world.directory.path().join("question-observed")).unwrap(),
            "verified"
        );
        let page = w.world.store.task_conversation(&w.task, None).unwrap();
        assert_eq!(page.messages.len(), 2);
        for message in page.messages {
            assert_eq!(
                serde_json::to_value(message.question.unwrap()).unwrap(),
                target
            );
            assert!(message.result.is_none());
        }
        assert_eq!(serde_json::to_value(w.current()).unwrap(), before);
        assert_eq!(
            std::fs::read_to_string(&w.world.path).unwrap(),
            w.head.content
        );
    }
}

#[test]
fn question_identity_does_not_fall_back_for_wrong_owner_head_or_partial_unit() {
    use docreview_core::domain::change_question::{QuestionRequest, QuestionSubject};
    let w = UnitWorld::source();
    let batch = w.start();
    let original = QuestionRequest {
        document_id: w.head.id.clone(),
        task_id: w.task.clone(),
        batch_id: batch.id.clone(),
        expected_head_id: w.head.version_id.clone(),
        subject: QuestionSubject::Unit {
            id: batch.review_units[0].id.clone(),
            revision: 1,
        },
    };
    for field in [
        "task", "document", "head", "batch", "revision", "proposal", "whole",
    ] {
        let mut input = original.clone();
        match field {
            "task" => input.task_id = w.world.runtime.id(),
            "document" => input.document_id = w.world.runtime.id(),
            "head" => input.expected_head_id = w.world.runtime.id(),
            "batch" => input.batch_id = w.world.runtime.id(),
            "revision" => {
                input.subject = QuestionSubject::Unit {
                    id: batch.review_units[0].id.clone(),
                    revision: 2,
                }
            }
            "proposal" => {
                input.subject = QuestionSubject::Proposal {
                    id: batch.proposals[0].id.clone(),
                    revision: 1,
                }
            }
            _ => input.subject = QuestionSubject::Whole,
        }
        assert!(
            w.world.store.prepare_change_question(&input).is_err(),
            "{field}"
        );
    }
    assert!(!w.world.store.task_review(&w.task).unwrap().generating);
}

fn execute_question(w: &UnitWorld, target: &Value, codex: bool) {
    use docreview_core::{
        claude_adapter::generation,
        domain::provider::{ProviderModel, ReasoningEffort},
    };
    use std::sync::{Arc, atomic::AtomicBool};
    std::fs::write(
        w.world.directory.path().join("expected-question.json"),
        serde_json::to_vec(target).unwrap(),
    )
    .unwrap();
    let mut input = request(w, target.clone());
    if codex {
        input.model = ProviderModel::Codex {
            model: "fixture-codex".into(),
            effort: ReasoningEffort::Low,
        };
    }
    generation::execute(
        &w.world.store,
        &question_launcher(w, codex),
        input,
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
}
fn question_launcher(
    w: &UnitWorld,
    codex: bool,
) -> docreview_core::claude_adapter::execution::CliLauncher {
    use docreview_core::claude_adapter::{execution::CliLauncher, process::ProcessSpec};
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let file = if codex {
        "fake-codex.mjs"
    } else {
        "fake-claude.mjs"
    };
    let mode = if codex { "SUCCESS" } else { "EXPLAIN" };
    let spec = ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures").join(file).into_os_string(),
            mode.into(),
        ],
        directory: w.world.directory.path().canonicalize().unwrap(),
        timeout: std::time::Duration::from_secs(5),
        environment: std::collections::BTreeMap::from([(
            "HOME".into(),
            w.world.directory.path().as_os_str().to_owned(),
        )]),
    };
    if codex {
        CliLauncher::CodexFixture(spec)
    } else {
        CliLauncher::Fixture(spec)
    }
}
