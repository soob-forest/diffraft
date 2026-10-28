mod batch_decisions;
mod comment_links;
mod comments;
mod common_rules;
mod conflict_reads;
mod context_history;
mod conversation;
mod database;
mod documents;
mod editor;
mod errors;
pub mod export_files;
#[cfg(feature = "test-support")]
pub mod export_testing;
mod exporting;
pub mod files;
mod generation_completion;
mod generation_context;
mod generation_execution;
mod generation_jobs;
mod generation_messages;
pub mod generation_models;
mod generation_result;
mod history;
mod job_lifecycle;
mod journal;
mod local_documents;
pub mod models;
mod navigation;
mod queries;
mod recovery;
mod regeneration;
mod regeneration_context;
mod regeneration_result;
mod resolution_records;
mod resolutions;
mod restoration;
mod review_decisions;
mod review_effects;
pub mod review_jobs;
mod review_projection;
mod review_queries;
mod review_register;
mod review_state;
mod revisions;
mod rewrite_apply;
mod rewrite_context;
mod rewrite_jobs;
mod rewrite_register;
mod rewrite_validation;
pub mod runtime;
mod saving;
mod task_context;
mod writer_lock;
#[cfg(test)]
mod writer_lock_tests;

use crate::domain::{
    document::{DocumentSnapshot, VersionSummary, validate_id},
    error::AppError,
    ipc::DocumentSummary,
};
use errors::{file_error, lock_error};
use runtime::{Runtime, SystemRuntime};
use rusqlite::Connection;
use std::{
    collections::HashMap,
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
};

pub struct Store {
    directory: PathBuf,
    connection: Mutex<Connection>,
    document_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    runtime: Arc<dyn Runtime>,
    // Fields drop in declaration order: the DB must close before unlocking.
    _writer_lock: writer_lock::WriterLock,
    #[cfg(feature = "test-support")]
    observer: Mutex<Option<models::SaveObserver>>,
    #[cfg(feature = "test-support")]
    export_observer: Mutex<Option<export_testing::ExportObserver>>,
}

impl Store {
    pub fn open(directory: &Path) -> Result<Self, AppError> {
        Self::with_runtime(directory, Arc::new(SystemRuntime))
    }

    pub fn with_runtime(directory: &Path, runtime: Arc<dyn Runtime>) -> Result<Self, AppError> {
        fs::create_dir_all(directory).map_err(file_error)?;
        if fs::symlink_metadata(directory)
            .map_err(file_error)?
            .file_type()
            .is_symlink()
        {
            return Err(AppError::invalid(
                "작업 폴더에 심볼릭 링크를 사용할 수 없습니다.",
            ));
        }
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700)).map_err(file_error)?;
        let writer = writer_lock::WriterLock::acquire(directory)?;
        let store = Self {
            directory: fs::canonicalize(directory).map_err(file_error)?,
            connection: Mutex::new(database::open(directory)?),
            document_locks: Mutex::new(HashMap::new()),
            runtime,
            _writer_lock: writer,
            #[cfg(feature = "test-support")]
            observer: Mutex::new(None),
            #[cfg(feature = "test-support")]
            export_observer: Mutex::new(None),
        };
        store.recover()?;
        store.recover_jobs()?;
        Ok(store)
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>, AppError> {
        self.connection.lock().map_err(|_| lock_error())
    }

    fn document_lock(&self, id: &str) -> Result<Arc<Mutex<()>>, AppError> {
        validate_id(id)?;
        let mut locks = self.document_locks.lock().map_err(|_| lock_error())?;
        Ok(Arc::clone(
            locks
                .entry(id.to_owned())
                .or_insert_with(|| Arc::new(Mutex::new(()))),
        ))
    }

    pub fn snapshot(&self, id: &str) -> Result<DocumentSnapshot, AppError> {
        validate_id(id)?;
        queries::snapshot(&*self.connection()?, id)
    }

    pub fn documents(&self) -> Result<Vec<DocumentSummary>, AppError> {
        queries::summaries(&*self.connection()?)
    }

    pub fn versions(&self, id: &str) -> Result<Vec<VersionSummary>, AppError> {
        validate_id(id)?;
        queries::versions(&*self.connection()?, id)
    }

    pub fn version_content(&self, id: &str, number: u32) -> Result<String, AppError> {
        validate_id(id)?;
        queries::version_content(&*self.connection()?, id, number)
    }

    fn checkpoint(&self, _stage: models::SaveStage) -> Result<(), AppError> {
        #[cfg(feature = "test-support")]
        if let Some(observer) = self.observer.lock().map_err(|_| lock_error())?.clone() {
            observer(_stage)?;
        }
        Ok(())
    }

    #[cfg(feature = "test-support")]
    pub fn set_save_observer(&self, observer: models::SaveObserver) -> Result<(), AppError> {
        *self.observer.lock().map_err(|_| lock_error())? = Some(observer);
        Ok(())
    }

    #[cfg(feature = "test-support")]
    pub fn configure_database_for_test(
        &self,
        configure: impl FnOnce(&Connection) -> rusqlite::Result<()>,
    ) -> Result<(), AppError> {
        configure(&*self.connection()?).map_err(errors::database_error)
    }
}
mod buffer_copies;
