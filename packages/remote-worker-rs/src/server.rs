use std::sync::{Arc, Mutex};
use std::time::Instant;

use axum::Router;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use axum::routing::get;
use futures_util::StreamExt;

#[derive(Clone)]
pub struct AppState {
	pub last_heartbeat: Arc<Mutex<Instant>>,
}

pub fn make_router(last_heartbeat: Arc<Mutex<Instant>>) -> Router {
	Router::new()
		.route("/", get(ws_handler))
		.with_state(AppState { last_heartbeat })
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
	ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
	eprintln!("[ws] client connected");

	let hello = serde_json::json!({
		"type": "hello",
		"message": "git-yak remote-worker ready"
	});
	let _ = socket.send(Message::Text(hello.to_string())).await;

	while let Some(Ok(msg)) = socket.next().await {
		if let Message::Text(text) = msg {
			let response = crate::commands::dispatch(&text, &state).await;
			let _ = socket.send(Message::Text(response)).await;
		}
	}

	eprintln!("[ws] client disconnected");
}
