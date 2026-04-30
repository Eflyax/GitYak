use std::path::Path;

use crate::commands::resolve_file_path;
use crate::protocol::{self, WsRequest};

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

	let content = match req.payload.get("content").and_then(|v| v.as_str()) {
		Some(c) => c,
		None => return protocol::error(request_id, "content must be a string"),
	};

	let make_directory = req
		.payload
		.get("options")
		.and_then(|o| o.get("makeDirectory"))
		.and_then(|v| v.as_bool())
		.unwrap_or(false);

	let full_path = match resolve_file_path(Path::new(repo_path), file_path) {
		Ok(p) => p,
		Err(e) => return protocol::error(request_id, &e),
	};

	if make_directory {
		if let Some(parent) = full_path.parent() {
			if let Err(e) = tokio::fs::create_dir_all(parent).await {
				return protocol::error(request_id, &e.to_string());
			}
		}
	}

	match tokio::fs::write(&full_path, content).await {
		Ok(()) => protocol::success_no_data(request_id),
		Err(e) => protocol::error(request_id, &e.to_string()),
	}
}
