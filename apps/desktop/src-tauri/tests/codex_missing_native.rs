//! Read-only error contract; an empty temporary Codex home needs no account.
use docreview_core::{
    claude_adapter::process::ProcessSpec,
    codex_adapter::{profile, transport::Peer},
    domain::error::ErrorCode,
};
use serde_json::json;
use std::{
    collections::BTreeMap,
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

#[test]
#[ignore = "requires explicitly selected installed Codex; no account or generation"]
fn installed_missing_thread_error_is_classified_without_leaking_server_text() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().as_os_str().to_owned();
    let spec = ProcessSpec {
        program: std::env::var_os("DOCREVIEW_CODEX_BIN")
            .expect("explicit official CLI")
            .into(),
        args: profile::arguments(None).unwrap(),
        directory: directory.path().into(),
        environment: BTreeMap::from([("HOME".into(), path.clone()), ("CODEX_HOME".into(), path)]),
        timeout: Duration::from_secs(10),
    };
    let mut peer = Peer::start(&spec, directory.path(), Arc::new(AtomicBool::new(false))).unwrap();
    peer.call(1, "initialize", json!({"clientInfo":{"name":"docreview_contract_test","version":"0.1.0"},"capabilities":{"experimentalApi":true}})).unwrap();
    peer.send(b"{\"method\":\"initialized\"}\n").unwrap();
    let error = peer
        .call(
            2,
            "thread/resume",
            json!({
                "threadId":"00000000-0000-4000-8000-000000000001","excludeTurns":true,
            }),
        )
        .unwrap_err();
    peer.close().unwrap();
    assert_eq!(error.code, ErrorCode::SessionMissing);
    assert!(!error.message.contains("rollout"));
    assert!(!error.message.contains("00000000"));
}
