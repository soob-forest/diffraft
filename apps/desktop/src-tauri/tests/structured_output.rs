use docreview_core::{
    claude_adapter::{environment, process::ProcessOutput, result},
    domain::error::ErrorCode,
};
use serde_json::json;
use std::{
    collections::BTreeMap, ffi::OsString, os::unix::process::ExitStatusExt, process::ExitStatus,
};

fn output(code: i32, value: serde_json::Value) -> ProcessOutput {
    ProcessOutput {
        status: ExitStatus::from_raw(code << 8),
        stdout: serde_json::to_vec(&value).unwrap(),
        stderr: Vec::new(),
    }
}

#[test]
fn exhausted_schema_attempts_report_output_invalid_without_private_diagnostics() {
    for code in [0, 1] {
        let value = json!({"type":"result","subtype":"error_max_structured_output_retries","is_error":true,"errors":["synthetic private document detail"]});
        let error = result::response(&output(code, value)).unwrap_err();
        assert_eq!(error.code, ErrorCode::OutputInvalid);
        assert!(error.message.contains("형식"));
        assert!(!error.message.contains("synthetic private"));
    }
}

#[test]
fn structured_attempt_budget_allows_repairs_and_ignores_unbounded_parent_values() {
    for value in ["0", "1", "999", "unlimited"] {
        let source = BTreeMap::from([
            (OsString::from("HOME"), OsString::from("/synthetic/home")),
            ("MAX_STRUCTURED_OUTPUT_RETRIES".into(), value.into()),
        ]);
        let filtered = environment::filtered(&source).unwrap();
        assert_eq!(
            filtered.values[&OsString::from("MAX_STRUCTURED_OUTPUT_RETRIES")],
            "3"
        );
    }
}

#[test]
fn successful_validated_output_is_not_overridden_by_diagnostic_looking_content() {
    let value = json!({"type":"result","subtype":"success","is_error":false,"session_id":"10000000-0000-4000-8000-000000000001","structured_output":{"mode":"PATCH","schema_version":1,"summary":"error_max_structured_output_retries","changes":[{"block_id":"b1","before":"","after":"# Draft\n","reason":"Initial draft"}]}});
    assert!(result::response(&output(0, value)).is_ok());
}
