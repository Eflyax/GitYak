use crate::protocol::{self, WsRequest};

pub fn run(req: &WsRequest) -> String {
	let request_id = &req.request_id;

	let dir_path = req
		.payload
		.get("path")
		.and_then(|v| v.as_str())
		.filter(|s| !s.is_empty())
		.unwrap_or("/");

	#[derive(serde::Serialize)]
	struct DirEntry {
		name: String,
		#[serde(rename = "isDirectory")]
		is_directory: bool,
	}

	let read_dir = match std::fs::read_dir(dir_path) {
		Ok(rd) => rd,
		Err(e) => return protocol::error(request_id, &e.to_string()),
	};

	let mut entries: Vec<DirEntry> = read_dir
		.filter_map(|e| e.ok())
		.map(|e| {
			let name = e.file_name().to_string_lossy().into_owned();
			let is_directory = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
			DirEntry { name, is_directory }
		})
		.collect();

	entries.sort_by(|a, b| {
		b.is_directory
			.cmp(&a.is_directory)
			.then(a.name.cmp(&b.name))
	});

	protocol::success(
		request_id,
		serde_json::json!({ "path": dir_path, "entries": entries }),
	)
}
