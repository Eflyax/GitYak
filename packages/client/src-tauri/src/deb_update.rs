//! In-app update of the Linux .deb: download a release from gityak.com, verify its minisign
//! signature against the GitYak updater key, install it with pkexec + apt-get and relaunch.
//!
//! Shared by the Tauri 2 shell (this crate) and the Tauri 1 shell (`src-tauri-v1`, included by
//! path like shared_commands.rs), so it holds no Tauri types: each shell wraps these functions
//! in its own commands, because emitting events and exiting differ between Tauri versions.
//! It builds on every OS so its tests run on any dev machine; only Linux uses it.
//!
//! Nothing unverified may be installed: `install_verified_deb` installs only the file the last
//! `download_verified_deb` produced, and checks its signature again right before installing.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;

/// The GitYak updater public key: base64 of the minisign public key text, as written by
/// `tauri signer generate` (the same value as `plugins.updater.pubkey` in tauri.conf.json).
pub const UPDATE_PUBLIC_KEY: &str = include_str!("../updater.pub");

/// What the commands answer on any OS but Linux, where the platform's own updater is used.
pub const ONLY_ON_LINUX: &str = "In-app install is only available on Linux";

/// Event carrying `UpdateProgress` while `download_verified_deb` runs.
pub const PROGRESS_EVENT: &str = "update://progress";

/// Payload of PROGRESS_EVENT: `{downloaded, total}`, `total` null when the server sent no length.
#[derive(Clone, serde::Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// Updates are only ever downloaded from here.
const TRUSTED_URL_PREFIX: &str = "https://gityak.com/releases/";
/// Prefix of the per-user folder in the temp dir the update is downloaded to (`-<uid>` follows).
const DOWNLOAD_DIR_PREFIX: &str = "gityak-update";
/// What installs the .deb, run by absolute path so nothing earlier on PATH stands in for them.
const PKEXEC: &str = "/usr/bin/pkexec";
const APT_GET: &str = "/usr/bin/apt-get";
/// Where the .deb installs the GitYak executable.
const DEB_BIN_DIR: &str = "/usr/bin";
/// Why a copy that did not come from the .deb (or a system without apt/pkexec) gets no in-app
/// update: the frontend shows it with the Download button.
pub const NOT_FROM_DEB: &str =
    "This copy of GitYak was not installed from its .deb package, so it cannot update itself. Download the new version instead.";
/// Progress is reported at most once per this many bytes.
const PROGRESS_STEP: u64 = 256 * 1024;

static LAUNCH_EXE: OnceLock<PathBuf> = OnceLock::new();

/// The .deb the last successful `download_verified_deb` produced, with its signature.
static VERIFIED_DEB: Mutex<Option<(PathBuf, String)>> = Mutex::new(None);

/// Remembers the path of the running executable. Call first thing at startup: once dpkg has
/// replaced the binary, `current_exe()` points at the deleted old file instead.
pub fn remember_launch_exe() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = LAUNCH_EXE.set(without_deleted_suffix(exe));
    }
}

fn launch_exe() -> Result<PathBuf, String> {
    if let Some(exe) = LAUNCH_EXE.get() {
        return Ok(exe.clone());
    }
    std::env::current_exe()
        .map(without_deleted_suffix)
        .map_err(|e| format!("Cannot find the GitYak executable to restart: {e}"))
}

/// Linux reports the executable of a process whose binary was replaced as "<path> (deleted)".
fn without_deleted_suffix(exe: PathBuf) -> PathBuf {
    match exe.to_str().and_then(|s| s.strip_suffix(" (deleted)")) {
        Some(path) => PathBuf::from(path),
        None => exe,
    }
}

/// Whether this copy may update itself through the .deb: `exe` (the executable remembered at
/// launch) must be the one the package installs in /usr/bin, and apt-get and pkexec must exist
/// (`exists` checks a path; a parameter so tests do not depend on the machine they run on).
/// Otherwise installing would fail (no apt: pkexec exits 127, which reads as a wrong password)
/// or would install the release system-wide and then relaunch the same old self-built binary.
pub fn deb_self_update_check(exe: &Path, exists: impl Fn(&Path) -> bool) -> Result<(), String> {
    // parent() compares whole components: /usr/bin/../x has parent /usr/bin/.., not /usr/bin.
    let installed_by_deb = exe.is_absolute() && exe.parent() == Some(Path::new(DEB_BIN_DIR));
    if installed_by_deb && exists(Path::new(APT_GET)) && exists(Path::new(PKEXEC)) {
        Ok(())
    } else {
        Err(NOT_FROM_DEB.to_string())
    }
}

/// Whether `url` may be downloaded as an update: an https URL on gityak.com under /releases/
/// whose path names a plain `*.deb` file (a query is allowed). Refuses anything that could
/// point elsewhere or escape the folder: `..`, `@`, backslashes, fragments, whitespace, and
/// any `%` in the path, since URL parsers decode `%2e%2e` into a `..` segment.
pub fn is_trusted_update_url(url: &str) -> bool {
    let path = url.split('?').next().unwrap_or(url);
    url.starts_with(TRUSTED_URL_PREFIX)
        && !url.contains("..")
        && !path.contains('%')
        && !url.contains(['@', '\\', '#'])
        && url.chars().all(|c| c.is_ascii_graphic())
        && deb_file_name(url).is_some()
}

/// The file name of a release URL: the last segment of its path, when that is a plain `*.deb`
/// name (letters, digits, `.`, `_`, `-`, `+`, `~`; no leading dot).
pub fn deb_file_name(url: &str) -> Option<&str> {
    let path = url.split('?').next()?;
    let name = path.rsplit('/').next()?;
    let plain = name.len() > ".deb".len()
        && name.ends_with(".deb")
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-+~".contains(c));
    plain.then_some(name)
}

/// `tauri signer` writes keys and signatures as base64 of the minisign text.
fn decode_base64_text(b64: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|_| "not valid base64".to_string())?;
    String::from_utf8(bytes).map_err(|_| "not text".to_string())
}

/// Checks `signature_b64` (the content of a `tauri signer sign` .sig file) for `data` against
/// `pubkey_b64` (a `tauri signer generate` public key).
pub fn verify_signature(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> Result<(), String> {
    let public_key = decode_base64_text(pubkey_b64)
        .and_then(|text| minisign_verify::PublicKey::decode(&text).map_err(|e| e.to_string()))
        .map_err(|e| format!("The update public key is invalid ({e})."))?;
    let signature = decode_base64_text(signature_b64)
        .and_then(|text| minisign_verify::Signature::decode(&text).map_err(|e| e.to_string()))
        .map_err(|e| format!("The update signature is invalid ({e}), so the update was not installed."))?;
    // Legacy (non-prehashed) signatures are refused: `tauri signer` never makes them.
    public_key
        .verify(data, &signature, false)
        .map_err(|_| "The update is not signed by GitYak, so it was not installed.".to_string())
}

/// Downloads `url` to `dest`, through `dest` + ".part" renamed once complete. Reports
/// `(downloaded, total)` at the start, at most every 256 KiB and at the end. Redirects are not
/// followed, so only the trusted URL itself is ever fetched.
pub fn download(url: &str, dest: &Path, mut on_progress: impl FnMut(u64, Option<u64>)) -> Result<(), String> {
    if !is_trusted_update_url(url) {
        return Err(format!("Refusing to download an update from {url}"));
    }
    let agent = ureq::AgentBuilder::new()
        // ureq ignores https_proxy & co. unless asked; behind a mandatory proxy nothing else works.
        .try_proxy_from_env(true)
        .redirects(0)
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(60))
        .build();
    let response = agent.get(url).call().map_err(|e| format!("Downloading the update failed: {e}"))?;
    if response.status() != 200 {
        return Err(format!("Downloading the update failed: HTTP {}", response.status()));
    }
    let total = response.header("Content-Length").and_then(|v| v.trim().parse::<u64>().ok());

    let mut part_name = dest.as_os_str().to_owned();
    part_name.push(".part");
    let part = PathBuf::from(part_name);

    let result = (|| -> Result<(), String> {
        let mut file = std::fs::File::create(&part).map_err(|e| format!("Cannot save the update: {e}"))?;
        let mut reader = response.into_reader();
        let mut buf = vec![0u8; 64 * 1024];
        let mut downloaded: u64 = 0;
        let mut reported: u64 = 0;
        on_progress(0, total);
        loop {
            let n = reader.read(&mut buf).map_err(|e| format!("Downloading the update failed: {e}"))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).map_err(|e| format!("Cannot save the update: {e}"))?;
            downloaded += n as u64;
            if downloaded - reported >= PROGRESS_STEP {
                on_progress(downloaded, total);
                reported = downloaded;
            }
        }
        if total.is_some_and(|t| t != downloaded) {
            return Err("Downloading the update failed: the download is incomplete.".to_string());
        }
        file.sync_all().map_err(|e| format!("Cannot save the update: {e}"))?;
        if reported != downloaded {
            on_progress(downloaded, total);
        }
        std::fs::rename(&part, dest).map_err(|e| format!("Cannot save the update: {e}"))
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    result
}

/// The folder in `temp` the update of user `uid` is downloaded to. Per user, so one user's
/// leftover folder (writable only by them) does not stop another user's update.
fn download_dir_in(temp: &Path, uid: u32) -> PathBuf {
    temp.join(format!("{DOWNLOAD_DIR_PREFIX}-{uid}"))
}

#[cfg(unix)]
fn current_uid() -> u32 {
    // SAFETY: getuid has no preconditions and cannot fail.
    unsafe { libc::getuid() }
}

#[cfg(not(unix))]
fn current_uid() -> u32 {
    0
}

/// Empties `dir`, or creates it. The final create is not recursive, so it fails rather than
/// reusing a folder someone else recreated in the shared temp dir in the meantime.
fn prepare_download_dir(dir: &Path) -> Result<(), String> {
    let cannot = |e: std::io::Error| format!("Cannot prepare {} for the update: {e}", dir.display());
    match std::fs::symlink_metadata(dir) {
        // remove_dir_all does not follow symlinks: a symlink is removed, not its target.
        Ok(meta) if meta.is_dir() => std::fs::remove_dir_all(dir).map_err(cannot)?,
        Ok(_) => std::fs::remove_file(dir).map_err(cannot)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(cannot(e)),
    }
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        // Others may read (apt's sandbox user reads the .deb) but never write.
        builder.mode(0o755);
    }
    builder.create(dir).map_err(cannot)
}

/// Downloads the .deb at `url` to `<temp>/gityak-update-<uid>/<file name>` (the folder emptied
/// first) and verifies it against UPDATE_PUBLIC_KEY. Returns its path, or deletes it and fails.
/// Refuses before downloading anything when this copy cannot update itself (deb_self_update_check).
pub fn download_verified_deb(
    url: &str,
    signature_b64: &str,
    on_progress: impl FnMut(u64, Option<u64>),
) -> Result<PathBuf, String> {
    deb_self_update_check(&launch_exe()?, |path| path.exists())?;
    if !is_trusted_update_url(url) {
        return Err(format!("Refusing to download an update from {url}"));
    }
    let name = deb_file_name(url).ok_or("The update address does not name a .deb file.")?;
    if signature_b64.trim().is_empty() {
        return Err("The update has no signature, so it cannot be installed.".to_string());
    }

    // A new download replaces whatever was verified before.
    *lock_verified() = None;

    let dir = download_dir_in(&std::env::temp_dir(), current_uid());
    prepare_download_dir(&dir)?;
    let dest = dir.join(name);

    let verified = download(url, &dest, on_progress).and_then(|()| {
        let data = std::fs::read(&dest).map_err(|e| format!("Cannot read the downloaded update: {e}"))?;
        verify_signature(&data, signature_b64, UPDATE_PUBLIC_KEY)
    });

    match verified {
        Ok(()) => {
            *lock_verified() = Some((dest.clone(), signature_b64.trim().to_string()));
            Ok(dest)
        }
        Err(e) => {
            let _ = std::fs::remove_file(&dest);
            Err(e)
        }
    }
}

fn lock_verified() -> std::sync::MutexGuard<'static, Option<(PathBuf, String)>> {
    VERIFIED_DEB.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, PartialEq, Eq)]
pub enum InstallOutcome {
    Installed,
    /// The user dismissed the password prompt.
    Cancelled,
}

impl InstallOutcome {
    /// The value `install_deb_update` answers the frontend with.
    pub fn as_str(&self) -> &'static str {
        match self {
            InstallOutcome::Installed => "installed",
            InstallOutcome::Cancelled => "cancelled",
        }
    }
}

/// Turns how `pkexec apt-get install` ended (exit code and stderr, or why it could not start)
/// into an outcome or a message for the user.
pub fn map_pkexec_result(spawn: Result<(Option<i32>, String), std::io::ErrorKind>) -> Result<InstallOutcome, String> {
    let (code, stderr) = match spawn {
        Ok(ended) => ended,
        Err(std::io::ErrorKind::NotFound) => {
            return Err("pkexec is not installed, so GitYak cannot install the update. Download it instead.".to_string())
        }
        Err(kind) => return Err(format!("Installing the update failed: cannot run pkexec ({kind}).")),
    };
    match code {
        Some(0) => Ok(InstallOutcome::Installed),
        // pkexec: the authentication dialog was dismissed.
        Some(126) => Ok(InstallOutcome::Cancelled),
        // pkexec: not authorised, or no authentication agent to ask for the password.
        Some(127) => Err(
            "Not authorised to install the update (wrong password, or no password prompt is available in this session)."
                .to_string(),
        ),
        // apt-get exits with 100 on errors, among them a dpkg lock held by another process.
        Some(100) if stderr.to_lowercase().contains("lock") => {
            Err("Another package manager is running (e.g. automatic updates). Try again in a minute.".to_string())
        }
        other => {
            let detail = stderr
                .lines()
                .map(str::trim)
                .rfind(|line| !line.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| match other {
                    Some(code) => format!("exit code {code}"),
                    None => "the installer was terminated".to_string(),
                });
            Err(format!("Installing the update failed: {detail}"))
        }
    }
}

/// Installs a .deb with `pkexec apt-get install -y <path>`: polkit asks for the password, apt
/// resolves dependencies. The path is passed as its own argument, never through a shell.
pub fn install_deb(path: &Path) -> Result<InstallOutcome, String> {
    if !path.is_absolute() {
        return Err("Installing the update failed: the package path is not absolute.".to_string());
    }
    let spawn = Command::new(PKEXEC)
        .arg(APT_GET)
        .arg("install")
        .arg("-y")
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .map(|out| (out.status.code(), String::from_utf8_lossy(&out.stderr).into_owned()))
        .map_err(|e| e.kind());
    map_pkexec_result(spawn)
}

/// Installs `path` if it is the .deb the last `download_verified_deb` produced, after checking
/// its signature again (it has waited in the temp dir since). The file is deleted once installed.
pub fn install_verified_deb(path: &Path) -> Result<InstallOutcome, String> {
    let signature = match &*lock_verified() {
        Some((verified, signature)) if verified == path => signature.clone(),
        _ => return Err("Only an update GitYak downloaded and verified can be installed.".to_string()),
    };
    let data = std::fs::read(path).map_err(|e| format!("Cannot read the downloaded update: {e}"))?;
    verify_signature(&data, &signature, UPDATE_PUBLIC_KEY)?;

    let outcome = install_deb(path)?;
    if outcome == InstallOutcome::Installed {
        *lock_verified() = None;
        let _ = std::fs::remove_file(path);
    }
    Ok(outcome)
}

/// Starts a detached shell that waits for this process to exit, then starts the executable
/// remembered at launch (the installed path, e.g. /usr/bin/git-yak). The caller exits the app.
pub fn spawn_relaunch_helper() -> Result<(), String> {
    let exe = launch_exe()?;
    Command::new("/bin/sh")
        .arg("-c")
        .arg(r#"while kill -0 "$0" 2>/dev/null; do sleep 0.2; done; exec "$1""#)
        .arg(std::process::id().to_string())
        .arg(&exe)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(drop)
        .map_err(|e| format!("Cannot restart GitYak: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const SAMPLE: &[u8] = include_bytes!("deb_update_fixtures/sample.bin");
    const SAMPLE_SIG: &str = include_str!("deb_update_fixtures/sample.bin.sig");
    const TEST_PUB: &str = include_str!("deb_update_fixtures/test.pub");
    const OTHER_PUB: &str = include_str!("deb_update_fixtures/other.pub");

    #[test]
    fn verify_accepts_fixture() {
        assert_eq!(verify_signature(SAMPLE, SAMPLE_SIG, TEST_PUB), Ok(()));
    }

    #[test]
    fn verify_rejects_tampered_data() {
        let mut tampered = SAMPLE.to_vec();
        tampered[0] ^= 1;
        assert!(verify_signature(&tampered, SAMPLE_SIG, TEST_PUB).is_err());
    }

    #[test]
    fn verify_rejects_other_key() {
        assert!(verify_signature(SAMPLE, SAMPLE_SIG, OTHER_PUB).is_err());
    }

    #[test]
    fn verify_rejects_the_real_key_for_a_test_signature() {
        assert!(verify_signature(SAMPLE, SAMPLE_SIG, UPDATE_PUBLIC_KEY).is_err());
    }

    #[test]
    fn verify_rejects_garbage_signature() {
        assert!(verify_signature(SAMPLE, "not base64 at all!", TEST_PUB).is_err());
        // Valid base64, but not a minisign signature.
        assert!(verify_signature(SAMPLE, "aGVsbG8gd29ybGQK", TEST_PUB).is_err());
        assert!(verify_signature(SAMPLE, "", TEST_PUB).is_err());
    }

    #[test]
    fn updater_pub_is_valid_key() {
        let text = decode_base64_text(UPDATE_PUBLIC_KEY).expect("updater.pub is base64 text");
        assert!(minisign_verify::PublicKey::decode(&text).is_ok());
    }

    #[test]
    fn trusted_url_accepts_release_deb() {
        assert!(is_trusted_update_url(
            "https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb?src=update&from=2.2.0"
        ));
        assert!(is_trusted_update_url("https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb"));
    }

    #[test]
    fn trusted_url_rejects_http() {
        assert!(!is_trusted_update_url("http://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb"));
    }

    #[test]
    fn trusted_url_rejects_other_host() {
        assert!(!is_trusted_update_url("https://gityak.com.evil.io/releases/x.deb"));
        assert!(!is_trusted_update_url("https://evil.io/releases/x.deb"));
    }

    #[test]
    fn trusted_url_rejects_userinfo() {
        assert!(!is_trusted_update_url("https://evil@gityak.com/releases/x.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/@evil.io/x.deb"));
    }

    #[test]
    fn trusted_url_rejects_dot_dot() {
        assert!(!is_trusted_update_url("https://gityak.com/releases/../x.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2/..%2Fx.deb"));
        // The URL parser ureq uses decodes %2e in dot segments: these would leave /releases/.
        assert!(!is_trusted_update_url("https://gityak.com/releases/%2e%2e/evil.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/.%2e/x.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2/%2E%2e/%2e./x.deb"));
    }

    #[test]
    fn trusted_url_rejects_non_deb() {
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.AppImage"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2.3.0/x.deb.exe"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2.3.0/x.exe?f=x.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2.3.0/.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/"));
    }

    #[test]
    fn trusted_url_rejects_backslash_fragment_and_whitespace() {
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2\\x.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2/x.deb#y"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2/x y.deb"));
        assert!(!is_trusted_update_url("https://gityak.com/releases/v2/x.deb\n"));
    }

    #[test]
    fn deb_file_name_is_the_last_path_segment() {
        assert_eq!(
            deb_file_name("https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb?src=update&from=2.2.0"),
            Some("GitYak-2.3.0-linux-x64.deb")
        );
        assert_eq!(deb_file_name("https://gityak.com/releases/v2.3.0/"), None);
        assert_eq!(deb_file_name("https://gityak.com/releases/v2.3.0/a%2Fb.deb"), None);
    }

    #[test]
    fn pkexec_0_is_installed() {
        assert_eq!(map_pkexec_result(Ok((Some(0), String::new()))), Ok(InstallOutcome::Installed));
    }

    #[test]
    fn pkexec_126_is_cancelled() {
        assert_eq!(map_pkexec_result(Ok((Some(126), String::new()))), Ok(InstallOutcome::Cancelled));
    }

    #[test]
    fn pkexec_127_is_not_authorised() {
        assert_eq!(
            map_pkexec_result(Ok((Some(127), "Error executing command as another user: Not authorized".into()))),
            Err("Not authorised to install the update (wrong password, or no password prompt is available in this session).".into())
        );
    }

    #[test]
    fn pkexec_missing_is_explained() {
        assert_eq!(
            map_pkexec_result(Err(std::io::ErrorKind::NotFound)),
            Err("pkexec is not installed, so GitYak cannot install the update. Download it instead.".into())
        );
    }

    #[test]
    fn apt_lock_is_explained() {
        let stderr = "E: Could not get lock /var/lib/dpkg/lock-frontend. It is held by process 1234 (unattended-upgr)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), is another process using it?\n";
        assert_eq!(
            map_pkexec_result(Ok((Some(100), stderr.into()))),
            Err("Another package manager is running (e.g. automatic updates). Try again in a minute.".into())
        );
    }

    #[test]
    fn apt_other_error_shows_last_line() {
        let stderr = "W: something harmless\nE: Unable to correct problems, you have held broken packages.\n\n";
        assert_eq!(
            map_pkexec_result(Ok((Some(100), stderr.into()))),
            Err("Installing the update failed: E: Unable to correct problems, you have held broken packages.".into())
        );
    }

    #[test]
    fn install_refuses_a_file_that_was_not_downloaded_and_verified() {
        let result = install_verified_deb(Path::new("/tmp/someone-elses.deb"));
        assert!(result.is_err());
    }

    #[test]
    fn download_dir_is_emptied_and_recreated() {
        let dir = std::env::temp_dir().join(format!("gityak-update-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("old")).unwrap();
        std::fs::write(dir.join("stale.deb"), b"stale").unwrap();

        prepare_download_dir(&dir).unwrap();

        assert!(dir.is_dir());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// The files deb_self_update_check looks for, as on a Debian/Ubuntu system with GitYak's .deb.
    fn apt_system(path: &Path) -> bool {
        path == Path::new(APT_GET) || path == Path::new(PKEXEC)
    }

    #[test]
    fn self_update_allowed_for_the_installed_deb() {
        assert_eq!(deb_self_update_check(Path::new("/usr/bin/git-yak"), apt_system), Ok(()));
    }

    #[test]
    fn self_update_refused_outside_usr_bin() {
        for exe in [
            "/home/me/GitYak/target/release/git-yak",
            "/usr/local/bin/git-yak",
            "/opt/GitYak/git-yak",
            "/usr/bin/sub/git-yak",
            "/usr/bin/../local/bin/git-yak",
            "/usr/binx/git-yak",
            "usr/bin/git-yak",
        ] {
            assert_eq!(
                deb_self_update_check(Path::new(exe), apt_system),
                Err(NOT_FROM_DEB.to_string()),
                "{exe}"
            );
        }
    }

    #[test]
    fn self_update_refused_without_apt_get() {
        assert_eq!(
            deb_self_update_check(Path::new("/usr/bin/git-yak"), |p| p == Path::new(PKEXEC)),
            Err(NOT_FROM_DEB.to_string())
        );
    }

    #[test]
    fn self_update_refused_without_pkexec() {
        assert_eq!(
            deb_self_update_check(Path::new("/usr/bin/git-yak"), |p| p == Path::new(APT_GET)),
            Err(NOT_FROM_DEB.to_string())
        );
    }

    #[test]
    fn not_from_deb_message_is_the_agreed_text() {
        assert_eq!(
            NOT_FROM_DEB,
            "This copy of GitYak was not installed from its .deb package, so it cannot update itself. Download the new version instead."
        );
    }

    #[test]
    fn download_dir_is_per_user() {
        assert_eq!(download_dir_in(Path::new("/tmp"), 1000), PathBuf::from("/tmp/gityak-update-1000"));
        assert_ne!(download_dir_in(Path::new("/tmp"), 1000), download_dir_in(Path::new("/tmp"), 1001));
    }

    #[cfg(unix)]
    #[test]
    fn download_dir_symlink_is_replaced_not_followed() {
        let base = std::env::temp_dir().join(format!("gityak-update-symlink-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let target = base.join("target");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("keep.txt"), b"keep").unwrap();
        let dir = base.join("download");
        std::os::unix::fs::symlink(&target, &dir).unwrap();

        prepare_download_dir(&dir).unwrap();

        assert!(std::fs::symlink_metadata(&dir).unwrap().is_dir());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        assert!(target.join("keep.txt").exists(), "the symlink target was emptied");
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn deleted_suffix_is_stripped_from_the_exe_path() {
        assert_eq!(
            without_deleted_suffix(PathBuf::from("/usr/bin/git-yak (deleted)")),
            PathBuf::from("/usr/bin/git-yak")
        );
        assert_eq!(without_deleted_suffix(PathBuf::from("/usr/bin/git-yak")), PathBuf::from("/usr/bin/git-yak"));
    }
}
