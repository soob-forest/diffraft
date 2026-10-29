use std::{io, sync::OnceLock};
use tauri::Manager;

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

unsafe extern "C" {
    fn docreview_install_termination_guard(callback: extern "C" fn() -> bool) -> bool;
    #[cfg(feature = "e2e")]
    fn docreview_request_native_exit();
}

pub fn install(app: &tauri::AppHandle) -> io::Result<()> {
    APP.set(app.clone())
        .map_err(|_| io::Error::other("macOS 종료 보호가 이미 초기화됐습니다."))?;
    // setup runs on the AppKit main thread after Tao installs its delegate.
    if !unsafe { docreview_install_termination_guard(request_close) } {
        return Err(io::Error::other("macOS 종료 보호를 초기화하지 못했습니다."));
    }
    Ok(())
}

extern "C" fn request_close() -> bool {
    APP.get().is_none_or(|app| {
        // Once completion is queued, repeated AppKit Quit events must not start a
        // second termination path. The Tauri event loop owns the final exit.
        app.state::<super::app_shutdown::ShutdownState>().ready() || super::request_close(app)
    })
}

#[cfg(feature = "e2e")]
pub fn request_native_exit(app: tauri::AppHandle) -> Result<(), String> {
    app.run_on_main_thread(|| {
        // This is the AppKit path used by the real predefined Quit menu.
        unsafe { docreview_request_native_exit() };
    })
    .map_err(|_| "네이티브 종료 요청을 전달하지 못했습니다.".to_owned())
}
