use std::collections::BTreeSet;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, DebouncedEvent};
use tokio::sync::mpsc::UnboundedSender;

use crate::protocol;
use crate::server::AppState;

const DEBOUNCE: Duration = Duration::from_millis(300);

pub fn stop(state: &AppState) {
	*state.watcher.lock().unwrap() = None;
}

pub fn run(req: &protocol::WsRequest, state: &AppState, tx: &UnboundedSender<String>) -> String {
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

	// Without this an authenticated peer could start a recursive watch of any directory it
	// names — an entire filesystem included. A repository always has a `.git` entry (a
	// directory, or a file in a worktree or submodule), so requiring one bounds the watch to
	// something the app has a reason to observe.
	if !repo_path.join(".git").exists() {
		return protocol::error(
			request_id,
			&format!("Not a git repository (no .git entry): {}", repo_path.display()),
		);
	}

	stop(state);

	let sender = tx.clone();

	let mut debouncer = match new_debouncer(DEBOUNCE, move |res: DebounceEventResult| {
		let paths: Vec<String> = match res {
			// Deduplicated and ordered: a recursive watch of the repository root can report
			// the same path many times inside one debounce window.
			Ok(events) => events
				.into_iter()
				.map(|e: DebouncedEvent| e.path.display().to_string())
				.collect::<BTreeSet<String>>()
				.into_iter()
				.collect(),
			Err(_) => Vec::new(),
		};

		let frame = serde_json::json!({
			"type": "event",
			"event": "repoChanged",
			"paths": paths
		});

		let _ = sender.send(frame.to_string());
	}) {
		Ok(d) => d,
		Err(e) => return protocol::error(request_id, &format!("Failed to create watcher: {e}")),
	};

	// The whole repository is watched recursively — notify handles recursion on Linux,
	// unlike fs.watch in the Bun server.
	if let Err(e) = debouncer.watcher().watch(&repo_path, RecursiveMode::Recursive) {
		return protocol::error(request_id, &format!("Failed to watch repository: {e}"));
	}

	*state.watcher.lock().unwrap() = Some(debouncer);

	protocol::success_no_data(request_id)
}

pub fn unwatch(req: &protocol::WsRequest, state: &AppState) -> String {
	stop(state);

	protocol::success_no_data(&req.request_id)
}
