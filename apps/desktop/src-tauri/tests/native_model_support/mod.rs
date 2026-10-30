use docreview_core::{
    claude_adapter::{execution::CliLauncher, generation, process_lease, settings},
    domain::{
        ai::ResponseMode,
        conversation::{ConversationMessage, SavedGenerationRequest},
        document::DocumentSnapshot,
        editor::{ScopeSelection, TaskSnapshot},
        error::AppError,
        generation::{GenerateRequest, GenerationOutcome},
        model::ModelSelection,
        review::ReviewBatch,
    },
    storage::Store,
};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicBool},
    time::Instant,
};

pub const ORIGINAL: &str = "# Synthetic model check\n\nThis is a draft.\n";
const PATCH_INSTRUCTION: &str = "Replace only the word draft with reviewed in the supplied body block. Return exactly one PATCH change using the supplied block_id and exact before text. Keep the heading and newlines unchanged.";
const EXPLAIN_INSTRUCTION: &str = "Return the single word CONNECTED in an EXPLAIN answer. Do not change the document or the existing candidate.";
const DATABASE_FILE: &str = "workspace.sqlite3";

pub fn checked<T>(result: Result<T, AppError>) -> T {
    result.unwrap_or_else(|error| panic!("model_check_error={:?}", error.code))
}

pub fn selected_cli() -> PathBuf {
    let path = PathBuf::from(
        std::env::var_os("DOCREVIEW_TEST_CLI").expect("explicit DOCREVIEW_TEST_CLI required"),
    );
    assert!(path.is_absolute(), "DOCREVIEW_TEST_CLI must be absolute");
    path
}

pub struct World {
    pub directory: tempfile::TempDir,
    pub store: Store,
    pub head: DocumentSnapshot,
    pub task: String,
    pub path: PathBuf,
}

impl World {
    pub fn new(cli: &Path) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("synthetic.md");
        fs::write(&path, ORIGINAL).unwrap();
        let store = checked(Store::open(&directory.path().join("data")));
        checked(settings::save(store.directory(), cli));
        let head = checked(store.open_document(&path));
        let task = checked(store.put_task(TaskSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            document_id: head.id.clone(),
            goal: "Synthetic model compatibility".into(),
            pinned_rules: "Keep the heading and newlines unchanged".into(),
            summary: String::new(),
        }))
        .id;
        Self {
            directory,
            store,
            head,
            task,
            path,
        }
    }

    pub fn restart(self) -> Self {
        let Self {
            directory,
            store,
            head,
            task,
            path,
        } = self;
        let data = store.directory().to_owned();
        drop(store);
        Self {
            directory,
            store: checked(Store::open(&data)),
            head,
            task,
            path,
        }
    }

    pub fn request(&self, model: ModelSelection, mode: ResponseMode) -> GenerateRequest {
        GenerateRequest {
            model,
            document_id: self.head.id.clone(),
            task_id: self.task.clone(),
            expected_head_id: self.head.version_id.clone(),
            operation_id: uuid::Uuid::new_v4().to_string(),
            mode,
            selection: ScopeSelection::Whole,
            instruction: match mode {
                ResponseMode::Patch => PATCH_INSTRUCTION,
                ResponseMode::Explain => EXPLAIN_INSTRUCTION,
                ResponseMode::Rewrite => panic!("use the dedicated rewrite workflow"),
            }
            .into(),
            expected_active_batch_id: None,
            archive_previous: false,
            retry_of: None,
        }
    }

    pub fn execute(&self, request: GenerateRequest) -> Result<GenerationOutcome, AppError> {
        let started = Instant::now();
        let model = request.model;
        let operation = request.operation_id.clone();
        let result = generation::execute(
            &self.store,
            &CliLauncher::Installed,
            request,
            Arc::new(AtomicBool::new(false)),
        );
        let elapsed_ms = started.elapsed().as_millis();
        self.verify_source();
        checked(process_lease::require_clear(self.store.directory()));
        self.verify_attempt(&operation, model, result.is_ok());
        let record = self.execution_record(&operation);
        if let Some((recorded, _)) = &record {
            assert_eq!(recorded, model.alias().unwrap_or("cli_default"));
        }
        assert!(
            result.is_err() || record.is_some(),
            "successful execution must be recorded"
        );
        println!(
            "{}",
            serde_json::json!({
                "requested_model": model,
                "elapsed_ms": elapsed_ms,
                "success": result.is_ok(),
                "error_code": result.as_ref().err().map(|error| error.code),
                "cli_version": record.map(|(_, version)| version),
            })
        );
        result
    }

    pub fn verify_source(&self) {
        assert!(
            fs::read_to_string(&self.path).unwrap() == ORIGINAL,
            "source changed before approval"
        );
        let current = checked(self.store.snapshot(&self.head.id));
        assert!(
            current.content == ORIGINAL,
            "stored source changed before approval"
        );
        assert_eq!(current.version_id, self.head.version_id);
    }

    pub fn verify_history(&self, batch: &ReviewBatch, messages: &[ConversationMessage]) -> usize {
        let preserved = checked(self.store.review_batch(&batch.id));
        assert!(
            serde_json::to_value(&preserved).unwrap() == serde_json::to_value(batch).unwrap(),
            "existing candidate changed"
        );
        let page = checked(self.store.task_conversation(&self.task, None));
        assert!(page.messages.len() >= messages.len());
        for (previous, current) in messages.iter().zip(&page.messages) {
            assert!(
                serde_json::to_value(previous).unwrap() == serde_json::to_value(current).unwrap(),
                "existing conversation changed"
            );
        }
        page.messages.len()
    }

    fn verify_attempt(&self, operation: &str, model: ModelSelection, succeeded: bool) {
        let page = checked(self.store.task_conversation(&self.task, None));
        let attempt = page.last_attempt.expect("saved request required");
        assert_eq!(attempt.job_id, operation);
        assert_eq!(
            attempt.status,
            if succeeded { "SUCCEEDED" } else { "FAILED" }
        );
        let SavedGenerationRequest::Generate(request) = attempt.request else {
            panic!("expected saved generation request");
        };
        assert_eq!(request.model, model);
    }

    fn execution_record(&self, operation: &str) -> Option<(String, String)> {
        let database = Connection::open_with_flags(
            self.store.directory().join(DATABASE_FILE),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        database
            .query_row(
                "SELECT requested_model,cli_version FROM job_executions WHERE job_id=?1",
                [operation],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .unwrap()
    }
}
