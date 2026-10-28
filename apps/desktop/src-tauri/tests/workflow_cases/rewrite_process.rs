use crate::{
    rewrite_jobs::request,
    rewrite_world::{CONFIRMED, REWRITE, RewriteWorld},
};
use docreview_core::{
    claude_adapter::{execution::CliLauncher, process::ProcessSpec, rewrite},
    domain::error::ErrorCode,
};
use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

fn spec(mode: &str) -> ProcessSpec {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-claude.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: std::env::temp_dir(),
        environment: Default::default(),
        timeout: Duration::from_secs(5),
    }
}

#[test]
fn real_fake_process_registers_one_unapproved_whole_candidate_and_replays_without_launch() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    let request = request(&world);
    let flag = Arc::new(AtomicBool::new(false));
    let batch = rewrite::execute(
        store,
        &CliLauncher::Fixture(spec("REWRITE")),
        request.clone(),
        flag.clone(),
    )
    .unwrap();
    assert_eq!(batch.candidate_markdown.as_deref(), Some(REWRITE));
    assert_eq!(batch.status, "ACTIVE");
    let mut missing = spec("REWRITE");
    missing.program = "/nonexistent/docreview-cli".into();
    assert_eq!(
        rewrite::execute(store, &CliLauncher::Fixture(missing), request, flag)
            .unwrap()
            .id,
        batch.id
    );
    assert_eq!(
        std::fs::read_to_string(&world.world.path).unwrap(),
        CONFIRMED
    );
    assert_eq!(store.task_review(&world.task).unwrap().batches.len(), 2);
}

#[test]
fn invalid_wrong_mode_and_cancelled_processes_preserve_original_candidate() {
    let world = RewriteWorld::new();
    let store = &world.world.store;
    for mode in ["malformed", "EXPLAIN"] {
        assert!(
            rewrite::execute(
                store,
                &CliLauncher::Fixture(spec(mode)),
                request(&world),
                Arc::new(AtomicBool::new(false))
            )
            .is_err()
        );
        assert!(!store.task_review(&world.task).unwrap().generating);
    }
    assert_eq!(
        rewrite::execute(
            store,
            &CliLauncher::Fixture(spec("REWRITE")),
            request(&world),
            Arc::new(AtomicBool::new(true))
        )
        .unwrap_err()
        .code,
        ErrorCode::Cancelled
    );
    assert_eq!(
        store.review_batch(&world.batch.id).unwrap().status,
        "ACTIVE"
    );
    assert_eq!(store.task_review(&world.task).unwrap().batches.len(), 1);
    assert_eq!(
        std::fs::read_to_string(&world.world.path).unwrap(),
        CONFIRMED
    );
}
