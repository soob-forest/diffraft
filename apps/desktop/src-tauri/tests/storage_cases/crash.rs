use crate::support::{INITIAL_CONTENT, SAVED_CONTENT, TestRuntime, World};
use docreview_core::storage::{
    Store,
    models::{SaveReason, SaveRequest, SaveStage},
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

const READY_TIMEOUT: Duration = Duration::from_secs(10);

#[test]
#[ignore = "parent test runs this worker in an isolated child process"]
fn worker() {
    let directory = std::env::var_os("DOCREVIEW_TEST_DATA").expect("test data path");
    let id = std::env::var("DOCREVIEW_TEST_DOCUMENT").expect("document id");
    let operation = std::env::var("DOCREVIEW_TEST_OPERATION").expect("operation id");
    let target = std::env::var("DOCREVIEW_TEST_STAGE").expect("stage");
    let store = Store::with_runtime(
        std::path::Path::new(&directory),
        Arc::new(TestRuntime::new(100)),
    )
    .unwrap();
    store
        .set_save_observer(Arc::new(move |stage| {
            if format!("{stage:?}") == target {
                println!("READY");
                std::io::stdout().flush().unwrap();
                let mut signal = [0];
                std::io::stdin().read_exact(&mut signal).unwrap();
            }
            Ok(())
        }))
        .unwrap();
    store
        .save(SaveRequest {
            document_id: id,
            expected_version: 1,
            content: SAVED_CONTENT.to_owned(),
            operation_id: operation,
            reason: SaveReason::Edit,
        })
        .unwrap();
}

fn kill_at_stage(world: World, stage: SaveStage) {
    let request = world.request();
    let data = world.directory.path().join("data");
    drop(world.store);
    let child = start_worker(&data, &request, stage);
    kill_when_ready(child);
    let recovered = Store::with_runtime(&data, world.runtime.clone()).unwrap();
    let snapshot = recovered.snapshot(&world.document.id).unwrap();
    let committed = matches!(stage, SaveStage::FileReplaced | SaveStage::DbCommitted);
    assert_eq!(snapshot.version, if committed { 2 } else { 1 });
    assert_eq!(
        snapshot.content,
        if committed {
            SAVED_CONTENT
        } else {
            INITIAL_CONTENT
        }
    );
    assert_eq!(fs::read_to_string(&world.path).unwrap(), snapshot.content);
    recovered.recover().unwrap();
    assert_eq!(
        recovered.versions(&snapshot.id).unwrap().len(),
        snapshot.version as usize
    );
}

fn start_worker(data: &Path, request: &SaveRequest, stage: SaveStage) -> Child {
    Command::new(std::env::current_exe().unwrap())
        .args(["--ignored", "--exact", "crash::worker", "--nocapture"])
        .env("DOCREVIEW_TEST_DATA", data)
        .env("DOCREVIEW_TEST_DOCUMENT", &request.document_id)
        .env("DOCREVIEW_TEST_OPERATION", &request.operation_id)
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
    let ready = receiver.recv_timeout(READY_TIMEOUT);
    child.kill().unwrap();
    assert!(!child.wait().unwrap().success());
    reader.join().unwrap();
    ready.expect("worker reached exact save stage before SIGKILL");
}

#[test]
fn sigkill_and_restart_at_every_journal_stage() {
    for stage in [
        SaveStage::TempWritten,
        SaveStage::Prepared,
        SaveStage::BeforeReplace,
        SaveStage::FileReplaced,
        SaveStage::DbCommitted,
    ] {
        kill_at_stage(World::new(), stage);
    }
}
