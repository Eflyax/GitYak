mod browse_files;
mod git_call;
mod heartbeat;
mod read_file;
mod write_file;

use std::path::{Component, Path, PathBuf};

use crate::protocol;
use crate::server::AppState;

pub async fn dispatch(raw: &str, state: &AppState) -> String {
	let req: protocol::WsRequest = match serde_json::from_str(raw) {
		Ok(r) => r,
		Err(e) => {
			return serde_json::json!({
				"requestId": serde_json::Value::Null,
				"status": "error",
				"message": "Failed to parse message",
				"details": e.to_string()
			})
			.to_string();
		}
	};

	match req.command.as_str() {
		"gitCall" => git_call::run(&req).await,
		"readFile" => read_file::run(&req).await,
		"writeFile" => write_file::run(&req).await,
		"browseFiles" => browse_files::run(&req),
		"heartbeat" => heartbeat::run(&req, state),
		unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
	}
}

pub fn normalize_path(path: &Path) -> PathBuf {
	let mut components: Vec<Component> = Vec::new();
	for comp in path.components() {
		match comp {
			Component::ParentDir => {
				components.pop();
			}
			Component::CurDir => {}
			c => components.push(c),
		}
	}
	components.iter().collect()
}

pub fn resolve_file_path(repo_path: &Path, file_path: &str) -> Result<PathBuf, String> {
	let full = if Path::new(file_path).is_absolute() {
		PathBuf::from(file_path)
	} else {
		repo_path.join(file_path)
	};

	let normalized = normalize_path(&full);
	let normalized_repo = normalize_path(repo_path);
	let repo_prefix = format!("{}/", normalized_repo.display());

	if normalized != normalized_repo && !normalized.display().to_string().starts_with(&repo_prefix) {
		return Err(format!(
			"Access denied: path outside repository: {}",
			normalized.display()
		));
	}

	Ok(normalized)
}
