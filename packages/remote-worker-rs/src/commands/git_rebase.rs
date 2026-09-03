use crate::commands::resolve_file_path;
use crate::protocol;

fn build_args(
	action: &str,
	repo_path: &std::path::Path,
	req: &protocol::WsRequest,
) -> Result<Vec<String>, String> {
	if action == "continue" {
		return Ok(vec![
			"-c".into(),
			"core.editor=true".into(),
			"rebase".into(),
			"--continue".into(),
		]);
	}

	if action != "start" {
		return Err(format!("Unknown rebase action: {action}"));
	}

	let upstream = req
		.payload
		.get("upstream")
		.and_then(|v| v.as_str())
		.filter(|s| !s.is_empty())
		.ok_or("upstream must be a non-empty string")?;

	if upstream.starts_with('-') {
		return Err("upstream must not start with \"-\"".into());
	}

	let todo_raw = req
		.payload
		.get("todo_path")
		.and_then(|v| v.as_str())
		.filter(|s| !s.is_empty())
		.ok_or("todo_path must be a non-empty string")?;

	// The path is interpolated into a shell command via sequence.editor, so a single
	// quote would break out of the surrounding quotes.
	if todo_raw.contains('\'') {
		return Err("todo_path must not contain a single quote".into());
	}

	let todo = resolve_file_path(repo_path, todo_raw)?;

	if !todo.exists() {
		return Err(format!("Todo file does not exist: {}", todo.display()));
	}

	Ok(vec![
		"-c".into(),
		"core.editor=false".into(),
		"-c".into(),
		"rebase.missingCommitsCheck=ignore".into(),
		"-c".into(),
		format!("sequence.editor=cp '{}'", todo.display()),
		"rebase".into(),
		"-i".into(),
		"--autostash".into(),
		"--".into(),
		upstream.to_string(),
	])
}

pub async fn run(req: &protocol::WsRequest) -> String {
	let request_id = &req.request_id;

	let repo_path = match req.payload.get("repo_path").and_then(|v| v.as_str()) {
		Some(p) if !p.is_empty() => std::path::PathBuf::from(p),
		_ => return protocol::error(request_id, "repo_path must be a non-empty string"),
	};

	if !repo_path.exists() {
		return protocol::error(
			request_id,
			&format!("Repository path does not exist: {}", repo_path.display()),
		);
	}

	let action = req.payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

	let args = match build_args(action, &repo_path, req) {
		Ok(a) => a,
		Err(e) => return protocol::error(request_id, &e),
	};

	let output = tokio::process::Command::new("git")
		.args(&args)
		.current_dir(&repo_path)
		.output()
		.await;

	match output {
		Ok(out) if out.status.success() => {
			protocol::success(request_id, serde_json::json!(String::from_utf8_lossy(&out.stdout)))
		}
		Ok(out) => {
			let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
			protocol::error(
				request_id,
				if stderr.is_empty() { "git rebase failed" } else { &stderr },
			)
		}
		Err(e) => protocol::error(request_id, &format!("Failed to run git: {e}")),
	}
}
