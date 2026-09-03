use std::sync::{Arc, Mutex};
use std::time::Instant;

use axum::Router;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;

pub type WatcherHandle = notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>;

#[derive(Clone)]
pub struct AppState {
	pub last_heartbeat: Arc<Mutex<Instant>>,
	pub watcher: Arc<Mutex<Option<WatcherHandle>>>,
}

pub fn make_router(last_heartbeat: Arc<Mutex<Instant>>) -> Router {
	Router::new()
		.route("/", get(ws_handler))
		.with_state(AppState {
			last_heartbeat,
			watcher: Arc::new(Mutex::new(None)),
		})
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
	ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
	// Each connection owns its own watcher slot. The AppState injected by axum is shared
	// across every socket, so writing the watcher into it would let one client clobber
	// another's watch and let any disconnect stop everyone's.
	let state = AppState {
		watcher: Arc::new(Mutex::new(None)),
		..state
	};

	eprintln!("[ws] client connected");

	let (mut sink, mut stream) = socket.split();
	// Events and responses share one outbound channel so only this task touches the sink.
	let (tx, mut rx) = mpsc::unbounded_channel::<String>();

	let hello = serde_json::json!({
		"type": "hello",
		"message": "git-yak remote-worker ready"
	});
	let _ = tx.send(hello.to_string());

	let writer = tokio::spawn(async move {
		while let Some(msg) = rx.recv().await {
			if sink.send(Message::Text(msg)).await.is_err() {
				break;
			}
		}
	});

	while let Some(Ok(msg)) = stream.next().await {
		if let Message::Text(text) = msg {
			let response = crate::commands::dispatch(&text, &state, &tx).await;

			if let Some(response) = response {
				if tx.send(response).is_err() {
					break;
				}
			}
		}
	}

	crate::commands::watch_repo::stop(&state);
	drop(tx);
	let _ = writer.await;

	eprintln!("[ws] client disconnected");
}
