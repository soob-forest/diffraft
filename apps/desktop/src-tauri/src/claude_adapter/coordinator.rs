use super::{process_identity::uncertain, process_lease};
use crate::{
    domain::{
        document::validate_id,
        error::{AppError, ErrorCode},
        generation::GenerationSnapshot,
    },
    storage::Store,
};
use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Condvar, Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

const SHUTDOWN_LIMIT: Duration = Duration::from_secs(10);

struct Active {
    operation: String,
    cancelled: Arc<AtomicBool>,
}
struct State {
    active: Option<Active>,
    blocked: Option<AppError>,
    closing: bool,
}
pub struct Coordinator {
    directory: PathBuf,
    state: Mutex<State>,
    stopped: Condvar,
}
pub struct RunGuard {
    coordinator: Arc<Coordinator>,
    pub cancelled: Arc<AtomicBool>,
}

impl Coordinator {
    pub fn new(directory: &Path) -> Self {
        Self {
            directory: directory.into(),
            stopped: Condvar::new(),
            state: Mutex::new(State {
                active: None,
                blocked: process_lease::recover(directory).err(),
                closing: false,
            }),
        }
    }

    pub fn begin(self: &Arc<Self>, operation: &str) -> Result<RunGuard, AppError> {
        validate_id(operation)?;
        let mut state = self.lock()?;
        if let Some(error) = &state.blocked {
            return Err(error.clone());
        }
        if state.active.is_some() || state.closing {
            return Err(busy());
        }
        process_lease::require_clear(&self.directory)?;
        let cancelled = Arc::new(AtomicBool::new(false));
        state.active = Some(Active {
            operation: operation.into(),
            cancelled: cancelled.clone(),
        });
        Ok(RunGuard {
            coordinator: self.clone(),
            cancelled,
        })
    }

    pub fn snapshot(&self) -> Result<GenerationSnapshot, AppError> {
        let state = self.lock()?;
        let blocked = state.blocked.clone().or_else(|| {
            if state.active.is_none() {
                process_lease::require_clear(&self.directory).err()
            } else {
                None
            }
        });
        Ok(GenerationSnapshot {
            operation_id: state.active.as_ref().map(|active| active.operation.clone()),
            cancelling: state
                .active
                .as_ref()
                .is_some_and(|active| active.cancelled.load(Ordering::Acquire)),
            blocked: blocked.map(|error| error.message),
        })
    }

    pub fn cancel(&self, store: &Store, operation: &str) -> Result<(), AppError> {
        validate_id(operation)?;
        let state = self.lock()?;
        if let Some(active) = &state.active
            && active.operation == operation
        {
            // Serialize with result registration before signalling the process.
            store.cancel_generation(operation)?;
            active.cancelled.store(true, Ordering::Release);
        }
        Ok(())
    }

    fn lock(&self) -> Result<MutexGuard<'_, State>, AppError> {
        self.state.lock().map_err(|_| uncertain())
    }

    pub fn shutdown(&self, store: &Store) -> Result<(), AppError> {
        let mut state = self.lock()?;
        if let Some(active) = &state.active {
            store.cancel_generation(&active.operation)?;
            active.cancelled.store(true, Ordering::Release);
        }
        let had_active = state.active.is_some();
        state.closing = true;
        let (mut state, _) = self
            .stopped
            .wait_timeout_while(state, SHUTDOWN_LIMIT, |value| value.active.is_some())
            .map_err(|_| uncertain())?;
        let result = if state.active.is_some() {
            Err(uncertain())
        } else if had_active {
            process_lease::require_clear(&self.directory)
        } else {
            Ok(())
        };
        if result.is_err() {
            state.closing = false;
        }
        result
    }
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = self.coordinator.state.lock() {
            state.active = None;
            self.coordinator.stopped.notify_all();
        }
        // A poisoned state remains blocked; an outstanding lease is never removed here.
    }
}
fn busy() -> AppError {
    AppError::new(
        ErrorCode::Busy,
        "이미 생성 중인 요청이 있습니다. 종료 확인 후 다시 요청해 주세요.",
    )
}
