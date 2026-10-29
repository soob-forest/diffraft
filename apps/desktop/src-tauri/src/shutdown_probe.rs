use std::{fs, path::PathBuf};
use tauri::Manager;

// E2E only: records lifecycle metadata, never user content or paths.
pub fn record(app: &tauri::AppHandle) {
    let Some(root) = std::env::var_os("DOCREVIEW_E2E_DATA") else {
        return;
    };
    let root = PathBuf::from(root);
    assert!(root.is_absolute() && root.starts_with(std::env::temp_dir()));
    let value = serde_json::json!({
        "pid": std::process::id(),
        "ready": app.state::<super::app_shutdown::ShutdownState>().ready(),
        "windowAlive": app.get_webview_window("main").is_some(),
    });
    fs::write(root.join("shutdown-lifecycle.json"), value.to_string())
        .expect("종료 수명 검사 결과를 기록하지 못했습니다.");
}
