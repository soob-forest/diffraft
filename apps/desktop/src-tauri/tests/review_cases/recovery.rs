use crate::{
    support::TestRuntime,
    world::{BASE, ReviewWorld},
};
use docreview_core::{
    domain::review::{Decision, DecisionRequest, Validity},
    storage::{Store, models::SaveStage},
};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{Arc, mpsc},
    thread,
    time::Duration,
};

#[test]
#[ignore = "parent kills this isolated approval worker at exact journal stages"]
fn worker() {
    let data = std::env::var_os("DOCREVIEW_REVIEW_DATA").unwrap();
    let target = std::env::var("DOCREVIEW_REVIEW_STAGE").unwrap();
    let request: DecisionRequest = serde_json::from_slice(
        &fs::read(std::path::Path::new(&data).join("approval.json")).unwrap(),
    )
    .unwrap();
    let store = Store::with_runtime(
        std::path::Path::new(&data),
        Arc::new(TestRuntime::new(10000)),
    )
    .unwrap();
    store
        .set_save_observer(Arc::new(move |stage| {
            if format!("{stage:?}") == target {
                println!("READY");
                std::io::stdout().flush().unwrap();
                std::io::stdin().read_exact(&mut [0]).unwrap();
            }
            Ok(())
        }))
        .unwrap();
    store.accept_proposals(request).unwrap();
}

#[test]
fn approval_and_version_recover_together_after_five_sigkill_points() {
    for stage in [
        SaveStage::TempWritten,
        SaveStage::Prepared,
        SaveStage::BeforeReplace,
        SaveStage::FileReplaced,
        SaveStage::DbCommitted,
    ] {
        verify_recovery(stage);
    }
}

fn verify_recovery(stage: SaveStage) {
    let world = ReviewWorld::new();
    let request = world.request(&[0]);
    let data = world.world.directory.path().join("data");
    fs::write(
        data.join("approval.json"),
        serde_json::to_vec(&request).unwrap(),
    )
    .unwrap();
    drop(world.world.store);
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--ignored", "--exact", "recovery::worker", "--nocapture"])
        .env("DOCREVIEW_REVIEW_DATA", &data)
        .env("DOCREVIEW_REVIEW_STAGE", format!("{stage:?}"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    kill_when_ready(child);
    let store = Store::with_runtime(&data, world.world.runtime.clone()).unwrap();
    let head = store.snapshot(&world.head.id).unwrap();
    let batch = store.review_batch(&world.batch.id).unwrap();
    let committed = matches!(stage, SaveStage::FileReplaced | SaveStage::DbCommitted);
    assert_recovered_decision(&head, &batch, committed);
    assert_eq!(batch.proposals[1].validity, Validity::Valid);
    assert_eq!(batch.apply_head_id, head.version_id);
    let expected = if committed {
        BASE.replace(
            &batch.proposals[0].operation.before,
            &batch.proposals[0].operation.after,
        )
    } else {
        BASE.into()
    };
    assert_eq!(head.content, expected);
    assert_eq!(fs::read_to_string(&world.world.path).unwrap(), expected);
    store.recover().unwrap();
    if committed {
        assert_eq!(store.accept_proposals(request).unwrap().version, 13);
    }
}

fn assert_recovered_decision(
    head: &docreview_core::domain::document::DocumentSnapshot,
    batch: &docreview_core::domain::review::ReviewBatch,
    committed: bool,
) {
    let (version, decision) = if committed {
        (13, Decision::Accepted)
    } else {
        (12, Decision::Pending)
    };
    assert_eq!(head.version, version);
    assert_eq!(batch.proposals[0].decision, decision);
}

#[test]
fn reads_and_new_decisions_do_not_invalidate_an_unfinished_approval() {
    use docreview_core::domain::error::{AppError, ErrorCode};
    let world = ReviewWorld::new();
    world
        .world
        .store
        .set_save_observer(Arc::new(|stage| {
            if stage == SaveStage::FileReplaced {
                return Err(AppError::new(
                    ErrorCode::SaveFailed,
                    "injected commit failure",
                ));
            }
            Ok(())
        }))
        .unwrap();
    assert!(
        world
            .world
            .store
            .accept_proposals(world.request(&[0]))
            .is_err()
    );
    let _ = world
        .world
        .store
        .review_projection(&world.batch.id, &world.head.version_id);
    assert!(
        world
            .world
            .store
            .accept_proposals(world.request(&[1]))
            .is_err()
    );
    world.world.store.recover().unwrap();
    assert_eq!(
        world.world.store.snapshot(&world.head.id).unwrap().version,
        13
    );
    let batch = world.world.store.review_batch(&world.batch.id).unwrap();
    assert_eq!(batch.proposals[0].decision, Decision::Accepted);
    assert_eq!(batch.proposals[1].validity, Validity::Valid);
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
    ready.expect("approval reached exact save phase");
}
