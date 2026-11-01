use docreview_core::codex_adapter::launch::{supported, workspace};
use std::os::unix::fs::PermissionsExt;

const TASK: &str = "00000000-0000-4000-8000-000000000001";

#[test]
fn version_gate_requires_a_stable_complete_version_at_or_above_the_verified_contract() {
    for version in ["0.165.0", "0.166.0", "1.0.0"] {
        assert!(supported(version));
    }
    for version in [
        "0.164.9",
        "0.165",
        "0.165.0-beta",
        "0.165.00",
        "v0.165.0",
        "0.165.0\n",
    ] {
        assert!(!supported(version));
    }
}

#[test]
fn dedicated_workspace_is_private_stable_and_rejects_non_task_identifiers() {
    let directory = tempfile::tempdir().unwrap();
    let first = workspace(directory.path(), TASK).unwrap();
    assert_eq!(first, workspace(directory.path(), TASK).unwrap());
    assert!(first.is_absolute());
    assert_eq!(
        first.metadata().unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert!(workspace(directory.path(), "../outside").is_err());
}

#[test]
fn workspace_refuses_symlinked_roots_and_task_directories() {
    for task_link in [false, true] {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = directory.path().join("codex-work");
        let target = if task_link {
            std::fs::create_dir(&root).unwrap();
            root.join(TASK)
        } else {
            root
        };
        std::os::unix::fs::symlink(outside.path(), target).unwrap();
        assert!(workspace(directory.path(), TASK).is_err());
        assert!(std::fs::read_dir(outside.path()).unwrap().next().is_none());
    }
}
