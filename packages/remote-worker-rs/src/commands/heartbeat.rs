use std::time::Instant;

use crate::protocol::{self, WsRequest};
use crate::server::AppState;

pub fn run(req: &WsRequest, state: &AppState) -> String {
	if let Ok(mut last) = state.last_heartbeat.lock() {
		*last = Instant::now();
	}
	protocol::success_no_data(&req.request_id)
}
