//! Standard base64 (RFC 4648, padded). Hand-rolled to keep the uploaded worker binary free of
//! another dependency; it only ever encodes.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn encode(bytes: &[u8]) -> String {
	let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);

	for chunk in bytes.chunks(3) {
		let b0 = chunk[0] as u32;
		let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
		let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
		let n = (b0 << 16) | (b1 << 8) | b2;

		out.push(ALPHABET[(n >> 18) as usize & 63] as char);
		out.push(ALPHABET[(n >> 12) as usize & 63] as char);
		out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
		out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
	}

	out
}

#[cfg(test)]
mod tests {
	use super::encode;

	#[test]
	fn encodes_rfc4648_vectors() {
		assert_eq!(encode(b""), "");
		assert_eq!(encode(b"f"), "Zg==");
		assert_eq!(encode(b"fo"), "Zm8=");
		assert_eq!(encode(b"foo"), "Zm9v");
		assert_eq!(encode(b"foob"), "Zm9vYg==");
		assert_eq!(encode(b"fooba"), "Zm9vYmE=");
		assert_eq!(encode(b"foobar"), "Zm9vYmFy");
	}

	#[test]
	fn encodes_binary_bytes() {
		assert_eq!(encode(&[0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]), "iVBORwD/");
	}
}
