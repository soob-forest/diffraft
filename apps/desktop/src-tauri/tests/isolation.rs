use std::{fs, path::PathBuf};

struct TestWorld {
    directory: tempfile::TempDir,
    now_ms: i64,
    next_id: u32,
}

impl TestWorld {
    fn new() -> Self {
        Self {
            directory: tempfile::tempdir().unwrap(),
            now_ms: 1_793_059_200_000,
            next_id: 0,
        }
    }

    fn database_path(&self) -> PathBuf {
        self.directory.path().join("workspace.sqlite3")
    }

    fn id(&mut self) -> String {
        self.next_id += 1;
        format!("00000000-0000-4000-8000-{:012}", self.next_id)
    }
}

#[test]
fn independent_worlds_have_fixed_clock_and_local_identifiers() {
    let mut first = TestWorld::new();
    let mut second = TestWorld::new();
    assert_eq!(first.now_ms, second.now_ms);
    assert_eq!(first.id(), second.id());
    assert_ne!(first.database_path(), second.database_path());
    fs::write(first.database_path(), b"isolated").unwrap();
    assert!(!second.database_path().exists());
}

#[test]
fn canonical_fixtures_remain_exact_utf8() {
    let base = include_str!("../../../../docs/examples/base_v12.md");
    let confirmed = include_str!("../../../../docs/examples/confirmed_v14.md");
    let proposals: serde_json::Value =
        serde_json::from_str(include_str!("../../../../docs/examples/proposals.json")).unwrap();
    assert_eq!(base.lines().count(), 13);
    assert_eq!(confirmed.lines().count(), 13);
    assert_eq!(proposals["changes"].as_array().unwrap().len(), 3);
    assert!(confirmed.contains("10분"));
    assert!(!confirmed.contains("5분"));
}
