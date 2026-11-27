//! Tauri 1 shell of GitYak, for Linux distributions whose webkit2gtk is too old for Tauri 2
//! (Ubuntu 20.04). Commands without Tauri-specific types come from the Tauri 2 shell's
//! shared_commands.rs; the rest are Tauri 1 versions of what src-tauri/src/lib.rs defines.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[path = "../../src-tauri/src/shared_commands.rs"]
mod shared_commands;
#[path = "../../src-tauri/src/deb_update.rs"]
mod deb_update;

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

/// Downloads the .deb update at `url` and verifies it against `signature` (deb_update.rs),
/// emitting update://progress. Answers the verified file's path.
#[tauri::command]
async fn download_deb_update(app: tauri::AppHandle, url: String, signature: String) -> Result<String, String> {
    if !cfg!(target_os = "linux") {
        return Err(deb_update::ONLY_ON_LINUX.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        deb_update::download_verified_deb(&url, &signature, |downloaded, total| {
            let _ = app.emit_all(deb_update::PROGRESS_EVENT, deb_update::UpdateProgress { downloaded, total });
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

fn main() {
    // Before anything else: once an update replaced the binary, current_exe() no longer names it.
    deb_update::remember_launch_exe();

    // With accelerated compositing, focal's webkit2gtk paints a blank window on every start
    // after the first (seen under Xvfb with software GL). The UI needs no GPU compositing;
    // a value the user sets still wins.
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

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
            get_platform,
            browse_directory,
            read_file_at,
            read_file_bytes,
            write_file_at,
            list_theme_files,
            terminate_process,
            get_launch_urls,
            run_git_raw,
            download_deb_update,
            install_deb_update,
            restart_after_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
