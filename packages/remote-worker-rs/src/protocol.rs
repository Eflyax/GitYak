use serde::Deserialize;

#[derive(Deserialize)]
pub struct WsRequest {
	#[serde(rename = "requestId")]
	pub request_id: String,
	pub command: String,
	#[serde(flatten)]
	pub payload: serde_json::Map<String, serde_json::Value>,
}

pub fn success(request_id: &str, data: serde_json::Value) -> String {
	serde_json::json!({
		"requestId": request_id,
		"status": "success",
		"data": data
	})
	.to_string()
}

pub fn success_no_data(request_id: &str) -> String {
	serde_json::json!({
		"requestId": request_id,
		"status": "success"
	})
	.to_string()
}

pub fn error(request_id: &str, message: &str) -> String {
	serde_json::json!({
		"requestId": request_id,
		"status": "error",
		"message": message
	})
	.to_string()
}
