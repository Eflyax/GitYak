import {describe, expect, it} from 'vitest';
import {isOriginAllowed} from './auth';

const ALLOWLIST = ['http://localhost:5173', 'tauri://localhost'];

describe('isOriginAllowed', () => {
	// A native client sends no Origin header; a browser always does. So "absent" means
	// "not a web page", which is exactly what we want to let through.
	it('allows a missing origin, which means a native client', () => {
		expect(isOriginAllowed(null, ALLOWLIST)).toBe(true);
	});

	it('allows an allowlisted origin', () => {
		expect(isOriginAllowed('http://localhost:5173', ALLOWLIST)).toBe(true);
		expect(isOriginAllowed('tauri://localhost', ALLOWLIST)).toBe(true);
	});

	it('refuses an arbitrary web page', () => {
		expect(isOriginAllowed('https://evil.example', ALLOWLIST)).toBe(false);
	});

	it('refuses a lookalike origin', () => {
		expect(isOriginAllowed('http://localhost:5173.evil.example', ALLOWLIST)).toBe(false);
		expect(isOriginAllowed('http://localhost:51730', ALLOWLIST)).toBe(false);
	});

	it('refuses an empty allowlist for any present origin', () => {
		expect(isOriginAllowed('http://localhost:5173', [])).toBe(false);
	});
});
