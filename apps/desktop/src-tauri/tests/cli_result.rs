use docreview_core::{
    claude_adapter::{process::ProcessOutput, result},
    domain::{MAX_RESPONSE_BYTES, error::ErrorCode},
};
use serde_json::json;
use std::{os::unix::process::ExitStatusExt, process::ExitStatus};

const SESSION: &str = "10000000-0000-4000-8000-000000000001";
fn output(code: i32, stdout: &str, stderr: &str) -> ProcessOutput {
    ProcessOutput {
        status: ExitStatus::from_raw(code << 8),
        stdout: stdout.as_bytes().to_vec(),
        stderr: stderr.as_bytes().to_vec(),
    }
}

#[test]
fn observed_missing_session_diagnostic_is_classified_without_exposing_the_id() {
    let value = output(
        1,
        "",
        &format!("No conversation found with session ID: {SESSION}\n"),
    );
    let error = result::response(&value).unwrap_err();
    assert_eq!(error.code, ErrorCode::SessionMissing);
    assert!(!error.message.contains(SESSION));
    let false_match = output(
        1,
        "",
        "No conversation found with session ID: invalid-secret",
    );
    assert_eq!(
        result::response(&false_match).unwrap_err().code,
        ErrorCode::UnknownError
    );
}

#[test]
fn known_error_envelopes_get_specific_codes_and_unknown_reasons_stay_unknown() {
    for (text, expected) in [
        ("Not logged in · Please run /login", ErrorCode::AuthRequired),
        ("API Error: 401 Unauthorized", ErrorCode::AuthRequired),
        ("API Error: 403 Forbidden", ErrorCode::RateOrPolicy),
        ("API Error: 429 Too Many Requests", ErrorCode::RateOrPolicy),
        ("API Error: Connection error.", ErrorCode::NetworkError),
        ("Prompt is too long", ErrorCode::ContextTooLarge),
        ("unclassified private details", ErrorCode::UnknownError),
    ] {
        let value=json!({"type":"result","subtype":"error_during_execution","is_error":true,"result":text}).to_string();
        let error = result::response(&output(1, &value, "")).unwrap_err();
        assert_eq!(error.code, expected);
        assert!(!error.message.contains(text));
    }
}

#[test]
fn successful_answer_is_not_interpreted_as_a_diagnostic_and_keeps_validated_session() {
    let body=json!({"type":"result","subtype":"success","is_error":false,"session_id":SESSION,"structured_output":{"schema_version":1,"mode":"EXPLAIN","answer":"API Error: 429 is an example"}}).to_string();
    let completion = result::completion(&output(0, &body, "")).unwrap();
    assert_eq!(completion.session_id, SESSION);
    assert_eq!(
        result::response(&output(1, &body, "")).unwrap_err().code,
        ErrorCode::UnknownError
    );
}

#[test]
fn unsupported_options_are_reported_without_exposing_cli_diagnostics() {
    for diagnostic in [
        "error: unknown option '--restricted'",
        "error: option '--permission-prompts <target>' argument 'none' is invalid. private detail",
    ] {
        let error = result::response(&output(1, "", diagnostic)).unwrap_err();
        assert_eq!(error.code, ErrorCode::CliUnsupported);
        assert!(!error.message.contains(diagnostic));
        assert!(!error.message.contains("private detail"));
    }
}

#[test]
fn output_budget_and_malformed_envelopes_are_rejected_before_result_registration() {
    let value = output(0, &"x".repeat(MAX_RESPONSE_BYTES), "x");
    assert_eq!(
        result::response(&value).unwrap_err().code,
        ErrorCode::OutputInvalid
    );
    for value in ["{}", "[]", "null", "{invalid"] {
        assert_eq!(
            result::response(&output(0, value, "")).unwrap_err().code,
            ErrorCode::OutputInvalid
        );
    }
}
