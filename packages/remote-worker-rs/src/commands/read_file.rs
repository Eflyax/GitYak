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

	let null_if_not_exists = req
		.payload
		.get("options")
		.and_then(|o| o.get("nullIfNotExists"))
		.and_then(|v| v.as_bool())
		.unwrap_or(false);

	let full_path = match resolve_file_path(Path::new(repo_path), file_path) {
		Ok(p) => p,
		Err(e) => return protocol::error(request_id, &e),
	};

	match tokio::fs::read_to_string(&full_path).await {
		Ok(content) => protocol::success(request_id, content.into()),
		Err(e) if e.kind() == std::io::ErrorKind::NotFound && null_if_not_exists => {
			protocol::success(request_id, serde_json::Value::Null)
		}
		Err(e) => protocol::error(request_id, &e.to_string()),
	}
}
