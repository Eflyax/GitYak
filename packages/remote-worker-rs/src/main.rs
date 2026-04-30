mod commands;
mod protocol;
mod server;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::net::TcpListener;

const PID_FILE: &str = "/tmp/gityak.pid";

#[tokio::main]
async fn main() {
	if std::env::args().any(|a| a == "--version") {
		println!("{}", env!("CARGO_PKG_VERSION"));
		return;
	}

	let _ = std::fs::write(PID_FILE, std::process::id().to_string());

	let port: u16 = std::env::var("PORT")
		.ok()
		.and_then(|v| v.parse().ok())
		.unwrap_or(0);
	let oneshot = std::env::var("ONESHOT").as_deref() == Ok("1");

	let last_heartbeat = Arc::new(Mutex::new(Instant::now()));

	let listener = TcpListener::bind(("127.0.0.1", port))
		.await
		.expect("Failed to bind port");
	let actual_port = listener.local_addr().unwrap().port();

	println!("SERVER_READY|PORT:{actual_port}");

	if oneshot {
		let hb = last_heartbeat.clone();
		tokio::spawn(async move {
			loop {
				tokio::time::sleep(Duration::from_secs(5)).await;
				if hb.lock().unwrap().elapsed() > Duration::from_secs(30) {
					eprintln!("[remote-worker] no heartbeat, shutting down");
					let _ = std::fs::remove_file(PID_FILE);
					std::process::exit(0);
				}
			}
		});
	}

	tokio::spawn(async {
		#[cfg(unix)]
		{
			use tokio::signal::unix::{SignalKind, signal};
			let mut sigterm = signal(SignalKind::terminate()).unwrap();
			let mut sigint = signal(SignalKind::interrupt()).unwrap();
			tokio::select! {
				_ = sigterm.recv() => {}
				_ = sigint.recv() => {}
			}
		}
		#[cfg(not(unix))]
		{
			tokio::signal::ctrl_c().await.unwrap();
		}
		let _ = std::fs::remove_file(PID_FILE);
		std::process::exit(0);
	});

	let app = server::make_router(last_heartbeat);
	axum::serve(listener, app).await.unwrap();
}
