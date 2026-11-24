// Small enough to pass to String.fromCharCode in one call without overflowing the stack.
const CHUNK = 0x8000;

/** Standard base64 of raw bytes (btoa only accepts a "binary string"). */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';

	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}

	return btoa(binary);
}
