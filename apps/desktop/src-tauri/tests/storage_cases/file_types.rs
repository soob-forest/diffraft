use crate::support::World;
use docreview_core::{
    domain::document::DocumentStatus,
    storage::{Store, files},
};
use std::{
    fs::{self, OpenOptions},
    os::unix::fs::OpenOptionsExt,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const WORKER_LIMIT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(20);

#[test]
fn fifo_read_returns_an_error_without_waiting_for_a_writer() {
    run_worker("read");
}

#[test]
fn fifo_write_preparation_returns_without_waiting_for_a_reader() {
    run_worker("write");
}

#[test]
fn fifo_with_a_reader_is_rejected_before_creating_a_temporary_file() {
    run_worker("write-paired");
}

#[test]
fn startup_marks_a_replaced_fifo_conflicted_and_keeps_other_documents_available() {
    run_worker("startup");
}

fn run_worker(mode: &str) {
    let directory = tempfile::tempdir().unwrap();
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--ignored", "--exact", "file_types::worker", "--nocapture"])
        .env("DOCREVIEW_FILE_TYPE_CASE", mode)
        .env("TMPDIR", directory.path())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    assert!(
        completes(child),
        "file type worker failed or blocked: {mode}"
    );
}

fn completes(mut child: Child) -> bool {
    let deadline = Instant::now() + WORKER_LIMIT;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status.success();
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            child.wait().unwrap();
            return false;
        }
        thread::sleep(POLL_INTERVAL);
    }
}

#[test]
#[ignore = "parent bounds the FIFO operation and reaps a blocked worker"]
fn worker() {
    let mode = std::env::var("DOCREVIEW_FILE_TYPE_CASE").unwrap();
    let world = World::new();
    let path = std::path::PathBuf::from(&world.document.path);
    let other = world.directory.path().join("other.md");
    fs::write(&other, "# 다른 문서는 정상\n").unwrap();
    let other = world.store.open_document(&other).unwrap();
    let data = world.directory.path().join("data");
    drop(world.store);
    fs::remove_file(&world.path).unwrap();
    assert!(
        Command::new("/usr/bin/mkfifo")
            .arg(&world.path)
            .status()
            .unwrap()
            .success()
    );
    match mode.as_str() {
        "read" => assert!(files::read_document(&path).is_err()),
        "write" => assert!(files::prepare_file(&world.path, "candidate").is_err()),
        "write-paired" => {
            let _reader = OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_NONBLOCK)
                .open(&world.path)
                .unwrap();
            assert!(files::prepare_file(&world.path, "candidate").is_err());
        }
        "startup" => {
            let store = Store::open(&data).unwrap();
            assert_eq!(
                store.snapshot(&world.document.id).unwrap().status,
                DocumentStatus::Conflict
            );
            assert_eq!(
                store.ensure_current(&other.id).unwrap().content,
                other.content
            );
        }
        _ => panic!("unknown file type case"),
    }
    assert!(!fs::metadata(&world.path).unwrap().is_file());
    assert!(fs::read_dir(world.directory.path()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".docreview-")
    }));
}
