mod deb_update;
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

/// Downloads the Linux .deb update at `url` and verifies it against `signature` (deb_update.rs),
/// emitting update://progress. Answers the verified file's path.
#[tauri::command]
async fn download_deb_update(app: tauri::AppHandle, url: String, signature: String) -> Result<String, String> {
    if !cfg!(target_os = "linux") {
        return Err(deb_update::ONLY_ON_LINUX.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Emitter;
        deb_update::download_verified_deb(&url, &signature, |downloaded, total| {
            let _ = app.emit(deb_update::PROGRESS_EVENT, deb_update::UpdateProgress { downloaded, total });
        })
        .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Installs the .deb download_deb_update verified, asking for the password through pkexec.
/// Answers "installed" or "cancelled". Async, so the password prompt does not block the UI.
#[tauri::command]
async fn install_deb_update(path: String) -> Result<String, String> {
    if !cfg!(target_os = "linux") {
        return Err(deb_update::ONLY_ON_LINUX.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        deb_update::install_verified_deb(std::path::Path::new(&path)).map(|outcome| outcome.as_str().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Starts GitYak again once this process has exited, then exits. Not AppHandle::restart: the
/// new instance could start before this one is gone and be turned away by single-instance.
#[tauri::command]
fn restart_after_update(app: tauri::AppHandle) -> Result<(), String> {
    if !cfg!(target_os = "linux") {
        return Err(deb_update::ONLY_ON_LINUX.to_string());
    }
    deb_update::spawn_relaunch_helper()?;
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before anything else: once an update replaced the binary, current_exe() no longer names it.
    deb_update::remember_launch_exe();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Desktop only: the updater and process plugins do not exist on mobile.
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            let _ = app;
            Ok(())
        })
        .on_window_event(webview_fit::on_window_event)
        .invoke_handler(tauri::generate_handler![detect_ssh_keys, find_free_port, get_server_binary_path, get_file_size, write_log, get_login_shell_path, get_platform, browse_directory, read_file_at, read_file_bytes, write_file_at, list_theme_files, terminate_process, download_deb_update, install_deb_update, restart_after_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
