use crate::{
    request,
    support::{INITIAL_CONTENT, World},
    world::add_task,
};
use docreview_core::{
    domain::export::{ExportFileKind, ExportFileRequest},
    storage::{Store, export_files::ExportDestination, export_testing::ExportStage},
};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Arc, mpsc},
    thread,
    time::Duration,
};

#[test]
#[ignore = "parent test kills this worker at exact export boundaries"]
fn worker() {
    let root = std::path::PathBuf::from(std::env::var_os("DOCREVIEW_TEST_ROOT").unwrap());
    let id = std::env::var("DOCREVIEW_TEST_DOCUMENT").unwrap();
    let target = std::env::var("DOCREVIEW_TEST_STAGE").unwrap();
    let store = Store::open(&root.join("data")).unwrap();
    let document = store.snapshot(&id).unwrap();
    store
        .set_export_observer(Arc::new(move |stage| {
            if format!("{stage:?}") == target {
                println!("READY");
                std::io::stdout().flush().unwrap();
                std::io::stdin().read_exact(&mut [0]).unwrap();
            }
            Ok(())
        }))
        .unwrap();
    store
        .export_file(
            &ExportFileRequest {
                snapshot: request(&document),
                kind: ExportFileKind::WorkingFile,
            },
            &ExportDestination::selected(&root.join("new-work.md")).unwrap(),
        )
        .unwrap();
}

#[test]
fn sigkill_preserves_files_versions_and_atomic_path_binding() {
    for stage in [
        ExportStage::CopyWritten,
        ExportStage::PathUpdating,
        ExportStage::PathBound,
    ] {
        recover_stage(stage);
    }
}

fn recover_stage(stage: ExportStage) {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    drop(world.store);
    kill_when_ready(start_worker(
        world.directory.path(),
        &world.document.id,
        stage,
    ));
    let data = world.directory.path().join("data");
    let store = Store::open(&data).unwrap();
    let head = store.ensure_current(&world.document.id).unwrap();
    let copy = world.directory.path().join("new-work.md");
    let bound = stage == ExportStage::PathBound;
    let path = if bound { &copy } else { &world.path };
    assert_eq!(head.path, fs::canonicalize(path).unwrap().to_str().unwrap());
    assert_eq!(head.version_id, world.document.version_id);
    assert_eq!(store.versions(&head.id).unwrap().len(), 1);
    assert_eq!(store.editor_state(&head.id).unwrap().tasks[0].id, task);
    assert_eq!(fs::read_to_string(copy).unwrap(), INITIAL_CONTENT);
    assert_eq!(fs::read_to_string(world.path).unwrap(), INITIAL_CONTENT);
    let connection = rusqlite::Connection::open(data.join("workspace.sqlite3")).unwrap();
    let events: u32 = connection
        .query_row(
            "SELECT COUNT(*) FROM decision_events WHERE kind='working_file_changed'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(events, u32::from(bound));
}

fn start_worker(root: &Path, id: &str, stage: ExportStage) -> Child {
    Command::new(std::env::current_exe().unwrap())
        .args(["--ignored", "--exact", "crash::worker", "--nocapture"])
        .env("DOCREVIEW_TEST_ROOT", root)
        .env("DOCREVIEW_TEST_DOCUMENT", id)
        .env("DOCREVIEW_TEST_STAGE", format!("{stage:?}"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}

fn kill_when_ready(mut child: Child) {
    let stdout = child.stdout.take().unwrap();
    let (sender, receiver) = mpsc::channel();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            if line.unwrap() == "READY" {
                sender.send(()).unwrap();
                break;
            }
        }
    });
    let ready = receiver.recv_timeout(Duration::from_secs(10));
    child.kill().unwrap();
    assert!(!child.wait().unwrap().success());
    reader.join().unwrap();
    ready.expect("exact export boundary reached before SIGKILL");
}
