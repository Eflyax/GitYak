//! Commands with no Tauri-version-specific types, shared by the Tauri 2 shell (this crate)
//! and the Tauri 1 shell for older Linux (`src-tauri-v1`), which includes this file by path.
//! Anything here must compile against both Tauri versions: plain std types only.

/// The user's home directory: $HOME on Unix, %USERPROFILE% on Windows.
fn home_dir() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default()
}

#[tauri::command]
pub fn detect_ssh_keys() -> Vec<String> {
    let home = home_dir();
    let ssh_dir = std::path::Path::new(&home).join(".ssh");

    ["id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"]
        .iter()
        .filter_map(|name| {
            let path = ssh_dir.join(name);
            if path.exists() {
                Some(path.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
pub fn find_free_port() -> Result<u16, String> {
    use std::net::TcpListener;
    TcpListener::bind("127.0.0.1:0")
        .map(|l| l.local_addr().unwrap().port())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_log(msg: String) {
    eprintln!("[app] {}", msg);
}

/// The OS and CPU architecture the app was built for (`std::env::consts`), e.g. "macos" and
/// "aarch64"; the update check uses them to pick the matching installer.
#[derive(serde::Serialize)]
pub struct Platform {
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
pub fn get_platform() -> Platform {
    Platform { os: std::env::consts::OS, arch: std::env::consts::ARCH }
}

/// Windows has no login shell to ask; the app inherits the user's PATH there.
#[cfg(windows)]
#[tauri::command]
pub fn get_login_shell_path() -> Result<String, String> {
    std::env::var("PATH").map_err(|e| e.to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn get_login_shell_path() -> Result<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = std::process::Command::new(&shell)
        .args(["-lic", "echo $PATH"])
        .output()
        .map_err(|e| e.to_string())?;
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .last()
        .unwrap_or("")
        .to_string();
    if path.is_empty() {
        Err("empty PATH".into())
    } else {
        Ok(path)
    }
}

#[tauri::command]
pub fn read_file_at(path: String, null_if_not_exists: bool) -> Result<Option<String>, String> {
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && null_if_not_exists => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn write_file_at(path: String, content: String, make_directory: bool) -> Result<(), String> {
    if make_directory {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    name: String,
    is_directory: bool,
}

#[tauri::command]
pub fn browse_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let expanded = if path.starts_with("~/") {
        let home = home_dir();
        std::path::PathBuf::from(format!("{}/{}", home, &path[2..]))
    } else {
        std::path::PathBuf::from(&path)
    };

    let mut entries: Vec<DirEntry> = std::fs::read_dir(&expanded)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_directory = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            Some(DirEntry { name, is_directory })
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_directory.cmp(&a.is_directory)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn list_theme_files(dir: String) -> Result<Vec<String>, String> {
    let expanded = if dir.starts_with("~/") {
        let home = home_dir();
        std::path::PathBuf::from(format!("{}/{}", home, &dir[2..]))
    } else {
        std::path::PathBuf::from(&dir)
    };

    let entries = std::fs::read_dir(&expanded).map_err(|e| e.to_string())?;

    let paths: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .ends_with(".jsonc")
        })
        .filter_map(|e| e.path().to_str().map(|s| s.to_owned()))
        .collect();

    Ok(paths)
}
