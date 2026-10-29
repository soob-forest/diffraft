use docreview_core::{
    commands::generation,
    domain::{error::AppError, ipc::SnapshotRequest},
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[derive(Default)]
pub struct ShutdownState(AtomicBool);

impl ShutdownState {
    pub fn ready(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }

    fn complete(&self) -> bool {
        !self.0.swap(true, Ordering::AcqRel)
    }
}

#[tauri::command]
pub async fn complete_shutdown(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: SnapshotRequest,
) -> Result<(), AppError> {
    request.validate()?;
    if window.label() != "main" {
        return Err(AppError::invalid("작업 공간에서 종료를 요청해 주세요."));
    }
    // Source/condition flush already completed in the main window. Wait for CLI cleanup
    // before authorizing ExitRequested; errors leave the application protected.
    generation::shutdown_generation(app.state(), app.state(), request).await?;
    if app.state::<ShutdownState>().complete() {
        app.exit(0);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::ShutdownState;

    #[test]
    fn exit_is_protected_until_cleanup_completes() {
        let state = ShutdownState::default();
        assert!(!state.ready());
        assert!(state.complete());
        assert!(state.ready());
    }

    #[test]
    fn repeated_completion_only_requests_one_exit() {
        let state = ShutdownState::default();
        assert!(state.complete());
        assert!(!state.complete());
    }
}
