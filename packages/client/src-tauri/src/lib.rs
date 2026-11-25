mod shared_commands;
mod webview_fit;

use shared_commands::*;

#[tauri::command]
fn get_server_binary_path(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app.path()
        .resolve("remote-worker-linux-x64", tauri::path::BaseDirectory::Resource)
        .map(|p: std::path::PathBuf| p.to_string_lossy().into_owned())
        .map_err(|e: tauri::Error| e.to_string())
}

// Raw bytes reach the webview as an ArrayBuffer; returning a Vec<u8> would serialize it as a
// JSON array of numbers, several times the size of an image.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .on_window_event(webview_fit::on_window_event)
        .invoke_handler(tauri::generate_handler![detect_ssh_keys, find_free_port, get_server_binary_path, get_file_size, write_log, get_login_shell_path, browse_directory, read_file_at, read_file_bytes, write_file_at, list_theme_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
