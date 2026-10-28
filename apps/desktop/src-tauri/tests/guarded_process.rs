mod guarded_support;
use docreview_core::{
    claude_adapter::{guarded_process, process_lease},
    domain::{MAX_CONTEXT_BYTES, error::ErrorCode},
};
use guarded_support::{RECORD, Worker, flag, read_record, spec, wait_for};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::PathBuf,
    sync::atomic::Ordering,
    thread,
};

#[test]
fn guarded_success_releases_the_record_after_process_exit() {
    let dir = tempfile::tempdir().unwrap();
    let result = guarded_process::run(
        &spec("echo", dir.path()),
        "한글 😀".as_bytes(),
        flag(),
        dir.path(),
    )
    .unwrap();
    assert!(result.status.success());
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&result.stdout).unwrap()["input"],
        "한글 😀"
    );
    assert!(!dir.path().join(RECORD).exists());
    process_lease::recover(dir.path()).unwrap();
}

#[test]
fn invalid_cancelled_and_unspawned_requests_leave_no_process_record() {
    let dir = tempfile::tempdir().unwrap();
    let mut missing = spec("echo", dir.path());
    missing.program = "/nonexistent/docreview-cli".into();
    let cancelled = flag();
    cancelled.store(true, Ordering::SeqCst);
    let error = guarded_process::run(&missing, b"", cancelled, dir.path())
        .err()
        .unwrap();
    assert_eq!(error.code, ErrorCode::Cancelled);
    let error = guarded_process::run(
        &missing,
        &vec![0; MAX_CONTEXT_BYTES + 1],
        flag(),
        dir.path(),
    )
    .err()
    .unwrap();
    assert_eq!(error.code, ErrorCode::ContextTooLarge);
    let error = guarded_process::run(&missing, b"", flag(), dir.path())
        .err()
        .unwrap();
    assert_eq!(error.code, ErrorCode::CliUnsupported);
    assert!(!dir.path().join(RECORD).exists());
}

#[test]
fn active_process_excludes_a_second_request_and_cancellation_releases_it() {
    let dir = tempfile::tempdir().unwrap();
    let directory = dir.path().to_owned();
    let cancelled = flag();
    let worker_flag = cancelled.clone();
    let worker = thread::spawn(move || {
        guarded_process::run(&spec("wait", &directory), b"", worker_flag, &directory)
    });
    wait_for(|| {
        fs::read(dir.path().join(RECORD))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .is_some_and(|value| value["process"].is_object())
    });
    let permission = fs::metadata(dir.path().join(RECORD))
        .unwrap()
        .permissions()
        .mode()
        & 0o777;
    let record = read_record(dir.path());
    let denied = guarded_process::run(&spec("echo", dir.path()), b"", flag(), dir.path())
        .err()
        .unwrap();
    cancelled.store(true, Ordering::SeqCst);
    let stopped = worker.join().unwrap().err().unwrap();
    assert_eq!(permission, 0o600);
    assert_eq!(record["process"]["pid"], record["process"]["group"]);
    assert_eq!(denied.code, ErrorCode::Busy);
    assert_eq!(stopped.code, ErrorCode::Cancelled);
    assert!(!dir.path().join(RECORD).exists());
}

#[test]
fn corrupted_or_linked_records_never_allow_new_execution() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(RECORD);
    fs::write(&path, "invalid").unwrap();
    assert_eq!(
        process_lease::recover(dir.path()).unwrap_err().code,
        ErrorCode::Busy
    );
    assert!(guarded_process::run(&spec("echo", dir.path()), b"", flag(), dir.path()).is_err());
    fs::remove_file(&path).unwrap();
    let target = dir.path().join("preserve");
    fs::write(&target, "unchanged").unwrap();
    symlink(&target, &path).unwrap();
    assert!(process_lease::recover(dir.path()).is_err());
    assert_eq!(fs::read_to_string(&target).unwrap(), "unchanged");
}

#[test]
fn restart_terminates_only_the_recorded_identity_after_parent_sigkill() {
    let mut worker = Worker::start();
    let path = worker.directory.path().join(RECORD);
    let saved = read_record(worker.directory.path());
    worker.kill_parent();
    let mut changed = saved.clone();
    changed["process"]["started"][0] =
        (saved["process"]["started"][0].as_u64().unwrap() + 1).into();
    fs::write(&path, serde_json::to_vec(&changed).unwrap()).unwrap();
    let denied = process_lease::recover(worker.directory.path()).unwrap_err();
    assert_eq!(denied.code, ErrorCode::Busy);
    assert_eq!(unsafe { libc::kill(-(worker.group as i32), 0) }, 0);
    fs::write(&path, serde_json::to_vec(&saved).unwrap()).unwrap();
    process_lease::recover(worker.directory.path()).unwrap();
    assert!(!path.exists());
    assert_ne!(unsafe { libc::kill(-(worker.group as i32), 0) }, 0);
    worker.group = 0;
}

#[test]
fn unidentified_pending_launch_stays_blocked_until_a_different_boot() {
    let mut worker = Worker::start();
    let path = worker.directory.path().join(RECORD);
    let saved = read_record(worker.directory.path());
    worker.kill_parent();
    process_lease::recover(worker.directory.path()).unwrap();
    worker.group = 0;
    let mut pending = saved;
    pending["process"] = serde_json::Value::Null;
    fs::write(&path, serde_json::to_vec(&pending).unwrap()).unwrap();
    assert_eq!(
        process_lease::recover(worker.directory.path())
            .unwrap_err()
            .code,
        ErrorCode::Busy
    );
    pending["boot"] = uuid::Uuid::new_v4().to_string().into();
    fs::write(&path, serde_json::to_vec(&pending).unwrap()).unwrap();
    process_lease::recover(worker.directory.path()).unwrap();
    assert!(!path.exists());
}

#[test]
#[ignore = "부모 검사가 강제 종료하는 전용 worker"]
fn crash_worker() {
    let directory = PathBuf::from(std::env::var_os("DOCREVIEW_GUARD_TEST_DIR").unwrap());
    let mut spec = spec("wait", &directory);
    spec.args = vec![
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/process.mjs")
            .into_os_string(),
        "guard-tree".into(),
        directory.as_os_str().into(),
    ];
    spec.timeout = std::time::Duration::from_secs(30);
    guarded_process::run(&spec, b"", flag(), &directory).unwrap();
}
