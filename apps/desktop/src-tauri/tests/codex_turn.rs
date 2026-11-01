use docreview_core::{
    codex_adapter::{protocol::Message, turn::Turn},
    domain::error::ErrorCode,
};
use serde_json::{Value, json};

fn notice(method: &str, params: Value) -> Message {
    Message::Notification {
        method: method.into(),
        params,
    }
}
fn start() -> Message {
    Message::Result {
        id: 1,
        value: json!({"turn":{"id":"turn_one"}}),
    }
}
fn item(text: &str) -> Value {
    json!({"type":"agentMessage","id":"final","phase":"final_answer","text":text})
}
fn completed(status: &str, items: Value) -> Message {
    notice(
        "turn/completed",
        json!({"threadId":"thread_one","turn":{"id":"turn_one","status":status,"items":items,"error":null}}),
    )
}
const ANSWER: &str = r#"{"schema_version":1,"mode":"EXPLAIN","answer":"합성 답변"}"#;

#[test]
fn resumed_thread_usage_metadata_cannot_bind_the_next_generation_to_a_previous_turn() {
    let mut turn = Turn::new("thread_one", 1);
    turn.push(notice(
        "thread/tokenUsage/updated",
        json!({"threadId":"thread_one","turnId":"previous_turn","tokenUsage":{}}),
    ))
    .unwrap();
    assert!(turn.push(start()).unwrap().is_none());
    assert!(
        turn.push(completed("completed", json!([item(ANSWER)])))
            .unwrap()
            .is_some()
    );
}

#[test]
fn final_result_waits_for_matching_rpc_and_completed_turn_even_when_events_arrive_first() {
    let mut turn = Turn::new("thread_one", 1);
    assert!(
        turn.push(completed("completed", json!([item(ANSWER)])))
            .unwrap()
            .is_none()
    );
    assert!(turn.push(start()).unwrap().is_some());
    assert!(
        turn.push(completed("completed", json!([item(ANSWER)])))
            .is_err()
    );
}

#[test]
fn streaming_and_commentary_are_not_saved_as_final_results() {
    let mut turn = Turn::new("thread_one", 1);
    turn.push(start()).unwrap();
    assert!(
        turn.push(notice(
            "item/agentMessage/delta",
            json!({"threadId":"thread_one","turnId":"turn_one","delta":"{"})
        ))
        .unwrap()
        .is_none()
    );
    let mut commentary = item(ANSWER);
    commentary["phase"] = json!("commentary");
    turn.push(notice(
        "item/completed",
        json!({"threadId":"thread_one","turnId":"turn_one","item":commentary}),
    ))
    .unwrap();
    assert_eq!(
        turn.push(completed("completed", json!([])))
            .unwrap_err()
            .code,
        ErrorCode::OutputInvalid
    );
}

#[test]
fn wrong_thread_turn_rpc_tool_and_partial_json_fail_closed() {
    for message in [
        notice(
            "turn/started",
            json!({"threadId":"other","turn":{"id":"turn_one"}}),
        ),
        notice(
            "turn/started",
            json!({"threadId":"thread_one","turn":{"id":"other"}}),
        ),
        Message::Result {
            id: 2,
            value: json!({}),
        },
        notice(
            "item/started",
            json!({"threadId":"thread_one","turnId":"turn_one","item":{"type":"commandExecution"}}),
        ),
        completed("completed", json!([item("{partial")])),
    ] {
        let mut turn = Turn::new("thread_one", 1);
        turn.push(start()).unwrap();
        assert!(turn.push(message).is_err());
    }
}

#[test]
fn cancelled_and_structured_limit_errors_never_expose_server_messages() {
    let mut turn = Turn::new("thread_one", 1);
    turn.push(start()).unwrap();
    assert_eq!(
        turn.push(completed("interrupted", json!([])))
            .unwrap_err()
            .code,
        ErrorCode::Cancelled
    );
    let mut turn = Turn::new("thread_one", 1);
    turn.push(start()).unwrap();
    let error=turn.push(notice("turn/completed",json!({"threadId":"thread_one","turn":{"id":"turn_one","status":"failed","error":{"codexErrorInfo":"usageLimitExceeded","message":"SECRET_FIXTURE"}}}))).unwrap_err();
    assert_eq!(error.code, ErrorCode::RateOrPolicy);
    assert!(!error.message.contains("SECRET_FIXTURE"));
}
