//! Tauri 1 shell of GitYak, for Linux distributions whose webkit2gtk is too old for Tauri 2
//! (Ubuntu 20.04). Commands without Tauri-specific types come from the Tauri 2 shell's
//! shared_commands.rs; the rest are Tauri 1 versions of what src-tauri/src/lib.rs defines.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[path = "../../src-tauri/src/shared_commands.rs"]
mod shared_commands;

use std::collections::HashMap;

use shared_commands::*;
use tauri::Manager;

const DEEP_LINK_SCHEME: &str = "gityak:";
/// The event the frontend's deep-link shim listens to (src/infrastructure/tauri/v1/deepLink.ts).
const DEEP_LINK_EVENT: &str = "deep-link://new-url";

fn deep_links(args: &[String]) -> Vec<String> {
    args.iter().filter(|a| a.starts_with(DEEP_LINK_SCHEME)).cloned().collect()
}

#[tauri::command]
fn get_server_binary_path(app: tauri::AppHandle) -> Result<String, String> {
    app.path_resolver()
        .resolve_resource("../../remote-worker/dist/remote-worker-linux-x64")
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "remote worker binary is not bundled".to_string())
}

/// Tauri 1 has no raw IPC response: the bytes travel as a JSON array of numbers.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// gityak:// links the app was started with; later ones arrive as DEEP_LINK_EVENT.
#[tauri::command]
fn get_launch_urls() -> Vec<String> {
    deep_links(&std::env::args().collect::<Vec<_>>())
}

#[derive(serde::Serialize)]
struct RawOutput {
    code: Option<i32>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

/// Runs git and returns its output as bytes. Tauri 1's shell API decodes output as text,
/// which mangles binary blobs (images in the diff preview). Only git can be run this way.
#[tauri::command]
async fn run_git_raw(args: Vec<String>, env: HashMap<String, String>) -> Result<RawOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(&args)
            .envs(&env)
            .output()
            .map(|o| RawOutput { code: o.status.code(), stdout: o.stdout, stderr: o.stderr })
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            let urls = deep_links(&argv);

            if !urls.is_empty() {
                let _ = app.emit_all(DEEP_LINK_EVENT, urls);
            }
        }))
        .invoke_handler(tauri::generate_handler![
            detect_ssh_keys,
            find_free_port,
            get_server_binary_path,
            get_file_size,
            write_log,
            get_login_shell_path,
            browse_directory,
            read_file_at,
            read_file_bytes,
            write_file_at,
            list_theme_files,
            get_launch_urls,
            run_git_raw
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
