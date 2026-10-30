use docreview_core::commands::{desktop, generation};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod app_shutdown;
#[cfg(target_os = "macos")]
mod native_termination;
#[cfg(feature = "e2e")]
mod shutdown_probe;

fn main() {
    let builder = tauri::Builder::default()
        .manage(app_shutdown::ShutdownState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            native_termination::install(app.handle())?;
            let state = desktop::initialize(app.handle());
            app.manage(generation::GenerationState::new(&state));
            app.manage(state);
            Ok(())
        });
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    commands(builder)
        .build(tauri::generate_context!())
        .expect("DocReview 앱을 시작할 수 없습니다.")
        .run(handle_exit);
}

fn handle_exit(app: &tauri::AppHandle, event: tauri::RunEvent) {
    #[cfg(feature = "e2e")]
    if matches!(event, tauri::RunEvent::Exit) {
        shutdown_probe::record(app);
    }
    if let tauri::RunEvent::ExitRequested { api, .. } = event
        && request_close(app)
    {
        api.prevent_exit();
    }
}

fn request_close(app: &tauri::AppHandle) -> bool {
    if app.state::<app_shutdown::ShutdownState>().ready() {
        return false;
    }
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    if window.close().is_err() {
        app.dialog().message("종료 요청을 전달하지 못했습니다. 입력을 저장한 뒤 창의 닫기 버튼으로 다시 시도해 주세요.").show(|_| {});
    }
    true
}

#[cfg(feature = "e2e")]
#[tauri::command]
fn e2e_request_native_exit(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return native_termination::request_native_exit(app);
    #[cfg(not(target_os = "macos"))]
    {
        app.exit(0);
        Ok(())
    }
}

#[cfg(not(feature = "e2e"))]
fn commands(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
        desktop::get_workspace_snapshot,
        desktop::editor_command,
        desktop::review_command,
        desktop::history_command,
        generation::generation_snapshot,
        generation::generate_document,
        generation::task_conversation,
        generation::cancel_generation,
        generation::shutdown_generation,
        app_shutdown::complete_shutdown,
        docreview_core::commands::connection::connection_command,
        docreview_core::commands::model_settings::model_settings_command,
        docreview_core::commands::regeneration::regenerate_proposal,
        docreview_core::commands::rewrite::generate_rewrite,
        desktop::conflict_command,
        desktop::save_buffer_copy,
        desktop::pick_document,
        desktop::new_document,
        desktop::open_preview_link,
        docreview_core::commands::export::export_snapshot,
        docreview_core::commands::export::copy_export,
        docreview_core::commands::export::save_export
    ])
}

#[cfg(feature = "e2e")]
fn commands(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
        desktop::get_workspace_snapshot,
        desktop::editor_command,
        desktop::review_command,
        desktop::history_command,
        generation::generation_snapshot,
        generation::generate_document,
        generation::task_conversation,
        generation::cancel_generation,
        generation::shutdown_generation,
        app_shutdown::complete_shutdown,
        docreview_core::commands::connection::connection_command,
        docreview_core::commands::model_settings::model_settings_command,
        docreview_core::commands::regeneration::regenerate_proposal,
        docreview_core::commands::rewrite::generate_rewrite,
        desktop::conflict_command,
        desktop::save_buffer_copy,
        desktop::pick_document,
        desktop::new_document,
        desktop::open_preview_link,
        docreview_core::commands::export::export_snapshot,
        docreview_core::commands::export::copy_export,
        docreview_core::commands::export::save_export,
        docreview_core::commands::e2e::e2e_process_id,
        docreview_core::commands::e2e::e2e_request_exit,
        e2e_request_native_exit,
        docreview_core::commands::e2e::e2e_register_ai
    ])
}
