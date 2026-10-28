use super::{Store, errors::lock_error};
use crate::domain::error::AppError;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportStage {
    CopyWritten,
    PathUpdating,
    PathBound,
}

pub type ExportObserver = Arc<dyn Fn(ExportStage) -> Result<(), AppError> + Send + Sync>;

impl Store {
    pub fn set_export_observer(&self, observer: ExportObserver) -> Result<(), AppError> {
        *self.export_observer.lock().map_err(|_| lock_error())? = Some(observer);
        Ok(())
    }

    pub(super) fn export_checkpoint(&self, stage: ExportStage) -> Result<(), AppError> {
        let observer = self
            .export_observer
            .lock()
            .map_err(|_| lock_error())?
            .clone();
        if let Some(observer) = observer {
            observer(stage)?;
        }
        Ok(())
    }
}
