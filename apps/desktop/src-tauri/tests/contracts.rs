use docreview_core::{
    commands::workspace,
    domain::{
        MAX_RESPONSE_BYTES,
        ai::{AiResponse, MAX_ANSWER_BYTES, MAX_CHANGES},
        error::ErrorCode,
        ipc::{AppEvent, SnapshotRequest},
    },
};
use serde_json::json;

fn parse(value: serde_json::Value) -> Result<AiResponse, docreview_core::domain::error::AppError> {
    AiResponse::parse(&serde_json::to_vec(&value).unwrap())
}

#[test]
fn accepts_three_exclusive_modes_and_empty_patch() {
    for value in [
        json!({"schema_version":1,"mode":"PATCH","summary":"변경 없음","changes":[]}),
        json!({"schema_version":1,"mode":"REWRITE","summary":"제목 변경","candidate_markdown":"# 제목\r\n"}),
        json!({"schema_version":1,"mode":"EXPLAIN","answer":"한국어 😀"}),
    ] {
        assert!(parse(value).is_ok());
    }
}

#[test]
fn rejects_missing_extra_wrong_mode_and_version() {
    for value in [
        json!({"schema_version":1,"mode":"EXPLAIN"}),
        json!({"schema_version":1,"mode":"EXPLAIN","answer":"a","changes":[]}),
        json!({"schema_version":1,"mode":"DELETE","answer":"a"}),
        json!({"schema_version":2,"mode":"EXPLAIN","answer":"a"}),
        json!({"schema_version":"1","mode":"EXPLAIN","answer":"a"}),
    ] {
        assert_eq!(parse(value).unwrap_err().code, ErrorCode::OutputInvalid);
    }
    assert!(AiResponse::parse(b"not JSON").is_err());
    assert!(AiResponse::parse(&[0xff]).is_err());
}

#[test]
fn enforces_utf8_bytes_and_response_size() {
    let boundary =
        json!({"schema_version":1,"mode":"EXPLAIN","answer":"a".repeat(MAX_ANSWER_BYTES)});
    assert!(parse(boundary).is_ok());
    let oversized =
        json!({"schema_version":1,"mode":"EXPLAIN","answer":"가".repeat(MAX_ANSWER_BYTES / 3 + 1)});
    assert!(parse(oversized).is_err());
    assert!(AiResponse::parse(&vec![b' '; MAX_RESPONSE_BYTES + 1]).is_err());
}

#[test]
fn validates_block_identifiers_and_patch_limits() {
    let change = json!({"block_id":"b_1-2","before":"한","after":"하","reason":"검사"});
    assert!(
        parse(json!({"schema_version":1,"mode":"PATCH","summary":"","changes":[change.clone()]}))
            .is_ok()
    );
    assert!(parse(json!({"schema_version":1,"mode":"PATCH","summary":"","changes":vec![change;MAX_CHANGES+1]})).is_err());
    for id in ["", "../file", "가", "a b"] {
        assert!(parse(json!({"schema_version":1,"mode":"PATCH","summary":"","changes":[{"block_id":id,"before":"","after":"a","reason":""}]})).is_err());
    }
}

#[test]
fn snapshot_and_event_share_versioned_wire_contract() {
    let directory = tempfile::tempdir().unwrap();
    let store = docreview_core::storage::Store::open(directory.path()).unwrap();
    let snapshot = workspace(&store, SnapshotRequest { schema_version: 1 }).unwrap();
    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        json!({"schemaVersion":1,"sequence":0,"documents":[],"selectedDocumentId":null})
    );
    assert_eq!(
        workspace(&store, SnapshotRequest { schema_version: 2 })
            .unwrap_err()
            .code,
        ErrorCode::SchemaUnsupported
    );
    assert!(
        serde_json::from_value::<SnapshotRequest>(json!({"schemaVersion":1,"extra":true})).is_err()
    );
    let event = json!({"schemaVersion":1,"sequence":1,"documentId":"document","taskId":null,"jobId":null,"kind":"job_progress","payload":{"message":"처리 중"}});
    assert!(serde_json::from_value::<AppEvent>(event).is_ok());
}
