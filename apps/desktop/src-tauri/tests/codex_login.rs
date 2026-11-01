use docreview_core::{
    claude_adapter::process::ProcessSpec, codex_adapter::login, domain::error::ErrorCode,
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

fn spec(directory: &Path, mode: &str) -> ProcessSpec {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-codex.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: directory.canonicalize().unwrap(),
        environment: std::collections::BTreeMap::from([(
            "HOME".into(),
            directory.as_os_str().to_owned(),
        )]),
        timeout: Duration::from_secs(3),
    }
}

#[test]
fn existing_chatgpt_account_is_reused_without_opening_or_replacing_login() {
    let directory = tempfile::tempdir().unwrap();
    login::login(
        &spec(directory.path(), "SUCCESS"),
        directory.path(),
        Arc::new(AtomicBool::new(false)),
        |_| panic!("existing login must be reused"),
    )
    .unwrap();
    assert!(!directory.path().join("cli-process.json").exists());
}

#[test]
fn managed_login_opens_only_the_validated_official_url_and_checks_completion() {
    let directory = tempfile::tempdir().unwrap();
    let mut opened = false;
    login::login(
        &spec(directory.path(), "LOGIN"),
        directory.path(),
        Arc::new(AtomicBool::new(false)),
        |url| {
            assert!(url.starts_with("https://auth.openai.com/"));
            opened = true;
            Ok(())
        },
    )
    .unwrap();
    assert!(opened);
    assert!(!directory.path().join("cli-process.json").exists());
}

#[test]
fn api_key_wrong_origin_and_unmatched_login_fail_without_leaking_or_changing_auth() {
    for mode in ["APIKEY", "LOGIN_BADURL", "LOGIN_MISMATCH"] {
        let directory = tempfile::tempdir().unwrap();
        let mut opened = false;
        let error = login::login(
            &spec(directory.path(), mode),
            directory.path(),
            Arc::new(AtomicBool::new(false)),
            |_| {
                opened = true;
                Ok(())
            },
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::AuthRequired);
        assert_eq!(opened, mode == "LOGIN_MISMATCH");
        assert!(!error.message.contains("fixture@example.invalid"));
        assert!(!directory.path().join("cli-process.json").exists());
    }
}
