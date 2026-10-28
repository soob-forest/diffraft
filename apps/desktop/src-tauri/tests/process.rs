use docreview_core::{
    claude_adapter::{
        process::{ProcessSpec, run},
        result,
    },
    domain::{MAX_CONTEXT_BYTES, error::ErrorCode},
};
use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
    time::{Duration, Instant},
};

fn spec(mode: &str) -> ProcessSpec {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    ProcessSpec {
        program: root.join(".tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("apps/desktop/tests/fixtures/fake-process.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: std::env::temp_dir(),
        environment: Default::default(),
        timeout: Duration::from_secs(3),
    }
}
fn flag(value: bool) -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(value))
}

#[test]
fn process_receives_literal_unicode_input() {
    let input = "한글 😀 `not-a-command` $(not-a-command)\r\n";
    let output = run(&spec("echo"), input.as_bytes(), flag(false)).unwrap();
    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["input"], input);
}
#[test]
fn output_budget_is_shared_by_stdout_and_stderr() {
    let error = run(&spec("flood"), b"", flag(false)).err().unwrap();
    assert_eq!(error.code, ErrorCode::OutputInvalid);
}
#[test]
fn timeout_reaps_child_and_descendant() {
    let mut spec = spec("tree");
    spec.timeout = Duration::from_millis(100);
    let start = Instant::now();
    assert_eq!(
        run(&spec, b"", flag(false)).err().unwrap().code,
        ErrorCode::NetworkError
    );
    assert!(start.elapsed() < Duration::from_secs(4));
}
#[test]
fn cancellation_and_input_bounds_prevent_launching_missing_executable() {
    let mut spec = spec("echo");
    spec.program = "/nonexistent/docreview-cli".into();
    assert_eq!(
        run(&spec, b"", flag(true)).err().unwrap().code,
        ErrorCode::Cancelled
    );
    assert_eq!(
        run(&spec, &vec![0; MAX_CONTEXT_BYTES + 1], flag(false))
            .err()
            .unwrap()
            .code,
        ErrorCode::ContextTooLarge
    );
    assert_eq!(
        run(&spec, b"", flag(false)).err().unwrap().code,
        ErrorCode::CliUnsupported
    );
}
#[test]
fn invalid_json_and_failed_exit_do_not_become_candidates() {
    let output = run(&spec("echo"), b"{}", flag(false)).unwrap();
    assert_eq!(
        result::response(&output).unwrap_err().code,
        ErrorCode::OutputInvalid
    );
    let failed = run(&spec("invalid"), b"", flag(false)).unwrap();
    assert!(!failed.status.success());
    assert!(result::response(&failed).is_err());
}

#[test]
fn inherited_pipe_does_not_hold_request_open_after_owned_process_exits() {
    let mut spec = spec("echo");
    spec.args = vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/process.mjs")
            .into_os_string(),
        "pipe-parent".into(),
    ];
    let output = run(&spec, b"", flag(false)).unwrap();
    assert_eq!(output.stdout, b"parent");
}

#[test]
fn cleared_environment_does_not_include_account_configuration() {
    let mut spec = spec("echo");
    spec.args = vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/process.mjs")
            .into_os_string(),
        "environment".into(),
    ];
    let output = run(&spec, b"", flag(false)).unwrap();
    let keys: Vec<String> = serde_json::from_slice(&output.stdout).unwrap();
    assert!(keys.iter().all(|key| key == "__CF_USER_TEXT_ENCODING"));
}
