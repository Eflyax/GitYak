use std::time::Duration;

use crate::protocol::{self, WsRequest};

pub async fn run(req: &WsRequest) -> String {
	let request_id = &req.request_id;

	let repo_path = match req.payload.get("repo_path").and_then(|v| v.as_str()) {
		Some(p) if !p.is_empty() => p.to_string(),
		_ => return protocol::error(request_id, "repo_path must be a non-empty string"),
	};

	let args: Vec<String> = match req.payload.get("args").and_then(|v| v.as_array()) {
		Some(arr) => {
			let mut result = Vec::new();
			for v in arr {
				match v.as_str() {
					Some(s) => result.push(s.to_string()),
					None => return protocol::error(request_id, "args must be a string[]"),
				}
			}
			result
		}
		None => return protocol::error(request_id, "args must be a string[]"),
	};

	let resolved = if std::path::Path::new(&repo_path).is_absolute() {
		std::path::PathBuf::from(&repo_path)
	} else {
		std::env::current_dir().unwrap_or_default().join(&repo_path)
	};

	if !resolved.exists() {
		return protocol::error(
			request_id,
			&format!("Repository path does not exist: {}", resolved.display()),
		);
	}

	eprintln!("[git] {:?}", args);

	let mut retries = 3u32;
	let mut delay_ms = 100u64;

	loop {
		match run_git(&resolved, &args).await {
			Ok(stdout) => return protocol::success(request_id, stdout.into()),
			Err(msg) if msg.contains(".git/index.lock': File exists") && retries > 0 => {
				tokio::time::sleep(Duration::from_millis(delay_ms)).await;
				retries -= 1;
				delay_ms *= 2;
			}
			Err(msg) => return protocol::error(request_id, &msg),
		}
	}
}

async fn run_git(cwd: &std::path::Path, args: &[String]) -> Result<String, String> {
	let output = tokio::process::Command::new("git")
		.args(args)
		.current_dir(cwd)
		.output()
		.await
		.map_err(|e| e.to_string())?;

	if output.status.success() {
		Ok(String::from_utf8_lossy(&output.stdout).into_owned())
	} else {
		let stdout = String::from_utf8_lossy(&output.stdout);
		let stderr = String::from_utf8_lossy(&output.stderr);
		Err(format!("{stdout}{stderr}"))
	}
}
