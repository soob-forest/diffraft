use docreview_core::claude_adapter::process::ProcessSpec;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, atomic::AtomicBool},
    thread,
    time::{Duration, Instant},
};

pub const RECORD: &str = "cli-process.json";
pub fn flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}
pub fn spec(mode: &str, directory: &Path) -> ProcessSpec {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    ProcessSpec {
        program: root.join("../../../.tools/node-v24.22.1-darwin-arm64/bin/node"),
        args: vec![
            root.join("../tests/fixtures/fake-process.mjs")
                .into_os_string(),
            mode.into(),
        ],
        directory: directory.into(),
        environment: Default::default(),
        timeout: Duration::from_secs(5),
    }
}
pub fn read_record(directory: &Path) -> serde_json::Value {
    serde_json::from_slice(&fs::read(directory.join(RECORD)).unwrap()).unwrap()
}
pub fn wait_for(predicate: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !predicate() {
        assert!(
            Instant::now() < deadline,
            "fixture synchronization timed out"
        );
        thread::sleep(Duration::from_millis(10));
    }
}

pub struct Worker {
    pub directory: tempfile::TempDir,
    child: Child,
    pub group: u32,
}
impl Worker {
    pub fn start() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "crash_worker", "--ignored", "--nocapture"])
            .env("DOCREVIEW_GUARD_TEST_DIR", directory.path())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut worker = Self {
            directory,
            child,
            group: 0,
        };
        wait_for(|| worker.directory.path().join("tree-ready.json").exists());
        worker.group = read_record(worker.directory.path())["process"]["pid"]
            .as_u64()
            .unwrap() as u32;
        worker
    }
    pub fn kill_parent(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            if let Err(error) = self.child.kill() {
                eprintln!("fixture cleanup: {:?}", error.kind());
            }
            if let Err(error) = self.child.wait() {
                eprintln!("fixture wait: {:?}", error.kind());
            }
        }
        if self.group > 1 {
            // Only this fixture's child process group is targeted.
            unsafe {
                libc::kill(-(self.group as i32), libc::SIGKILL);
            }
        }
    }
}
