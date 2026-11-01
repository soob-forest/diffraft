use docreview_core::{
    claude_adapter::{process::ProcessSpec, process_lease},
    codex_adapter::{protocol::Message, transport::Peer},
    domain::error::ErrorCode,
};
use serde_json::json;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

fn spec(directory: &std::path::Path, mode: &str) -> ProcessSpec {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-codex-contract.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: directory.into(),
        environment: Default::default(),
        timeout: Duration::from_secs(3),
    }
}

#[test]
fn stdio_rpc_uses_real_child_and_releases_owned_process_lease() {
    let directory = tempfile::tempdir().unwrap();
    let mut peer = Peer::start(
        &spec(directory.path(), "echo"),
        directory.path(),
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
    assert!(process_lease::require_clear(directory.path()).is_err());
    assert_eq!(
        peer.call(1, "fixture/read", json!({"text":"한글"}))
            .unwrap(),
        json!({"text":"한글"})
    );
    assert_eq!(peer.call(2, "fixture/read", json!({})).unwrap(), json!({}));
    peer.close().unwrap();
    peer.close().unwrap();
    process_lease::require_clear(directory.path()).unwrap();
    assert!(peer.call(3, "fixture/read", json!({})).is_err());
    assert!(peer.send(b"").is_err());
}

#[test]
fn cancellation_and_timeout_stop_owned_children() {
    let directory = tempfile::tempdir().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let mut peer = Peer::start(
        &spec(directory.path(), "hang"),
        directory.path(),
        cancelled.clone(),
    )
    .unwrap();
    assert!(matches!(
        peer.receive().unwrap(),
        Message::Notification { .. }
    ));
    cancelled.store(true, Ordering::Release);
    assert_eq!(
        peer.call(1, "fixture/read", json!({})).unwrap_err().code,
        ErrorCode::Cancelled
    );
    peer.close().unwrap();
    let mut short = spec(directory.path(), "hang");
    short.timeout = Duration::from_millis(100);
    let mut peer = Peer::start(&short, directory.path(), Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(
        peer.call(1, "fixture/read", json!({})).unwrap_err().code,
        ErrorCode::NetworkError
    );
    drop(peer);
    process_lease::require_clear(directory.path()).unwrap();
}

#[test]
fn invalid_response_oversized_stderr_and_partial_eof_fail_without_leaking_output() {
    for mode in ["wrong-id", "error", "oversized", "partial"] {
        let directory = tempfile::tempdir().unwrap();
        let mut peer = Peer::start(
            &spec(directory.path(), mode),
            directory.path(),
            Arc::new(AtomicBool::new(false)),
        )
        .unwrap();
        let error = peer.call(1, "fixture/read", json!({})).unwrap_err();
        assert!(!error.message.contains("SECRET_FIXTURE"));
        assert!(matches!(
            error.code,
            ErrorCode::OutputInvalid | ErrorCode::CliUnsupported
        ));
        peer.close().unwrap();
        process_lease::require_clear(directory.path()).unwrap();
    }
}

#[test]
fn spawn_failure_releases_lease_and_cancelled_start_never_reserves_it() {
    let directory = tempfile::tempdir().unwrap();
    let mut missing = spec(directory.path(), "echo");
    missing.program = directory.path().join("not-installed");
    assert!(Peer::start(&missing, directory.path(), Arc::new(AtomicBool::new(false))).is_err());
    process_lease::require_clear(directory.path()).unwrap();
    assert!(
        Peer::start(
            &spec(directory.path(), "echo"),
            directory.path(),
            Arc::new(AtomicBool::new(true))
        )
        .is_err()
    );
    process_lease::require_clear(directory.path()).unwrap();
}

#[test]
fn failed_lease_release_remains_failed_and_cannot_reuse_connection() {
    let directory = tempfile::tempdir().unwrap();
    let mut peer = Peer::start(
        &spec(directory.path(), "echo"),
        directory.path(),
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
    assert!(matches!(
        peer.receive().unwrap(),
        Message::Notification { .. }
    ));
    let path = directory.path().join("cli-process.json");
    let mut record: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    record["token"] = json!("00000000-0000-4000-8000-000000000001");
    let changed = serde_json::to_vec(&record).unwrap();
    std::fs::write(&path, &changed).unwrap();
    let first = peer.close().unwrap_err();
    assert_eq!(peer.close().unwrap_err(), first);
    assert!(peer.send(b"").is_err());
    assert!(peer.receive().is_err());
    drop(peer);
    assert_eq!(std::fs::read(&path).unwrap(), changed);
    assert!(process_lease::require_clear(directory.path()).is_err());
    assert!(
        Peer::start(
            &spec(directory.path(), "echo"),
            directory.path(),
            Arc::new(AtomicBool::new(false))
        )
        .is_err()
    );
    process_lease::recover(directory.path()).unwrap();
    process_lease::require_clear(directory.path()).unwrap();
}

#[test]
fn missing_thread_error_is_recoverable_only_for_resume_and_known_error_shape() {
    for (mode, method, expected) in [
        ("missing-thread", "thread/resume", ErrorCode::SessionMissing),
        ("missing-thread", "turn/start", ErrorCode::CliUnsupported),
        (
            "missing-thread-wrong-code",
            "thread/resume",
            ErrorCode::CliUnsupported,
        ),
        (
            "missing-thread-invalid-id",
            "thread/resume",
            ErrorCode::CliUnsupported,
        ),
    ] {
        let directory = tempfile::tempdir().unwrap();
        let mut peer = Peer::start(
            &spec(directory.path(), mode),
            directory.path(),
            Arc::new(AtomicBool::new(false)),
        )
        .unwrap();
        let error = peer
            .call(1, method, json!({"threadId":"synthetic-thread"}))
            .unwrap_err();
        assert_eq!(error.code, expected, "{mode}: {method}");
        assert!(!error.message.contains("synthetic-thread"));
        assert!(!error.message.contains("SECRET_FIXTURE"));
        peer.close().unwrap();
        process_lease::require_clear(directory.path()).unwrap();
    }
}
