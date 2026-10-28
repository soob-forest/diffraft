use docreview_core::{
    domain::{document::DocumentSnapshot, error::AppError},
    storage::{
        Store,
        models::{SaveReason, SaveRequest},
        runtime::Runtime,
    },
};
use std::{
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicI64, AtomicU32, Ordering},
    },
};

pub const INITIAL_CONTENT: &str = "\u{feff}# 제목\r\n한글 😀\r\n";
pub const SAVED_CONTENT: &str = "\u{feff}# 제목\r\n수정한 한글 😀\r\n";

pub struct TestRuntime {
    pub now: AtomicI64,
    next: AtomicU32,
}

impl TestRuntime {
    pub fn new(next: u32) -> Self {
        Self {
            now: AtomicI64::new(1_793_059_200_000),
            next: AtomicU32::new(next),
        }
    }
}

impl Runtime for TestRuntime {
    fn id(&self) -> String {
        format!(
            "00000000-0000-4000-8000-{:012}",
            self.next.fetch_add(1, Ordering::SeqCst) + 1
        )
    }
    fn now_ms(&self) -> Result<i64, AppError> {
        Ok(self.now.load(Ordering::SeqCst))
    }
}

pub struct World {
    pub directory: tempfile::TempDir,
    pub path: PathBuf,
    pub runtime: Arc<TestRuntime>,
    pub store: Store,
    pub document: DocumentSnapshot,
}

impl World {
    pub fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("document.md");
        fs::write(&path, INITIAL_CONTENT).unwrap();
        let runtime = Arc::new(TestRuntime::new(0));
        let store = Store::with_runtime(&directory.path().join("data"), runtime.clone()).unwrap();
        let document = store.open_document(&path).unwrap();
        Self {
            directory,
            path,
            runtime,
            store,
            document,
        }
    }

    pub fn request(&self) -> SaveRequest {
        SaveRequest {
            document_id: self.document.id.clone(),
            expected_version: self.document.version,
            content: SAVED_CONTENT.to_owned(),
            operation_id: self.runtime.id(),
            reason: SaveReason::Edit,
        }
    }

    pub fn database(&self) -> rusqlite::Connection {
        rusqlite::Connection::open(self.directory.path().join("data/workspace.sqlite3")).unwrap()
    }
}
