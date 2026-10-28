use docreview_core::{
    claude_adapter::{diagnostics, discovery, environment},
    domain::{connection::ConnectionStatus, error::ErrorCode},
};
use std::{collections::BTreeMap, ffi::OsString, fs, os::unix::fs::PermissionsExt, path::Path};

#[test]
fn unsigned_selected_file_is_rejected_before_execution() {
    let directory = tempfile::tempdir().unwrap();
    let marker = directory.path().join("executed");
    let path = directory.path().join("claude");
    fs::write(&path, "#!/bin/sh\nprintf forbidden > executed\n").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
    let environment = environment::filtered(&BTreeMap::from([(
        OsString::from("HOME"),
        directory.path().as_os_str().into(),
    )]))
    .unwrap();
    let error = diagnostics::inspect(&path, directory.path(), &environment).unwrap_err();
    assert_eq!(error.code, ErrorCode::CliUnsupported);
    assert!(!marker.exists());
    assert!(
        discovery::verify_signature(Path::new("/usr/bin/false"), directory.path(), &environment)
            .is_err()
    );
}

#[test]
#[ignore = "공식 CLI의 실제 계정 진단은 사용자가 명시적으로 실행합니다."]
fn installed_official_cli_reports_only_allowed_metadata() {
    let directory = tempfile::tempdir().unwrap();
    let environment = environment::current().unwrap();
    let home = Path::new(&environment.values[&OsString::from("HOME")]);
    let path = discovery::candidates(home, std::env::var_os("PATH").as_deref())
        .into_iter()
        .find(|path| path.exists())
        .expect("installed CLI");
    let report = diagnostics::inspect(&path, directory.path(), &environment).unwrap();
    println!(
        "connection_status={:?} cli_version={:?}",
        report.status, report.version
    );
    assert_eq!(report.status, ConnectionStatus::Ready);
}

#[test]
#[ignore = "실제 구독 한도를 사용하는 합성 연결 테스트. 별도 명시 실행 전용."]
fn installed_official_cli_completes_minimal_guarded_connection_test() {
    use docreview_core::claude_adapter::{connection, process_lease};
    use std::sync::{Arc, atomic::AtomicBool};
    let directory = tempfile::tempdir().unwrap();
    let operation = uuid::Uuid::new_v4().to_string();
    let report = connection::test(
        directory.path(),
        &operation,
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
    assert_eq!(report.status, ConnectionStatus::Ready);
    process_lease::require_clear(directory.path()).unwrap();
    println!("connection_test=passed cli_version={:?}", report.version);
}
