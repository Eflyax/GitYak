use std::path::Path;

use crate::commands::resolve_file_path;
use crate::protocol::{self, WsRequest};

/// File bytes as base64, so binary content such as images survives the JSON frame intact.
/// Without `revision` the file is read from the working tree; with it, from git.
pub async fn run(req: &WsRequest) -> String {
	let request_id = &req.request_id;

	let repo_path = match req.payload.get("repo_path").and_then(|v| v.as_str()) {
		Some(p) if !p.is_empty() => p,
		_ => return protocol::error(request_id, "repo_path must be a non-empty string"),
	};

	let file_path = match req.payload.get("file_path").and_then(|v| v.as_str()) {
		Some(p) if !p.is_empty() => p,
		_ => return protocol::error(request_id, "file_path must be a non-empty string"),
	};

	let revision = req.payload.get("revision").and_then(|v| v.as_str()).unwrap_or("");

	let bytes = if revision.is_empty() {
		match resolve_file_path(Path::new(repo_path), file_path) {
			Ok(full_path) => tokio::fs::read(&full_path).await.map_err(|e| e.to_string()),
			Err(e) => Err(e),
		}
	} else {
		read_at_revision(Path::new(repo_path), revision, file_path).await
	};

	match bytes {
		Ok(bytes) => protocol::success(request_id, crate::base64::encode(&bytes).into()),
		Err(e) => protocol::error(request_id, &e),
	}
}

async fn read_at_revision(repo_path: &Path, revision: &str, file_path: &str) -> Result<Vec<u8>, String> {
	// The object name is git's first positional argument; a leading "-" would make it an option.
	if revision.starts_with('-') {
		return Err(format!("Invalid revision: {revision}"));
	}

	let output = tokio::process::Command::new("git")
		.args(["cat-file", "blob", &format!("{revision}:{file_path}")])
		.current_dir(repo_path)
		.env("GIT_OPTIONAL_LOCKS", "0")
		.output()
		.await
		.map_err(|e| e.to_string())?;

	if output.status.success() {
		Ok(output.stdout)
	} else {
		let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
		Err(if stderr.is_empty() { format!("Cannot read {revision}:{file_path}") } else { stderr })
	}
}
