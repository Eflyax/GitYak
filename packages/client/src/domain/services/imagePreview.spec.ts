import {describe, it, expect} from 'vitest';
import {
	base64DataUrl,
	formatBase64Size,
	formatBytes,
	getImageMimeType,
	isRasterImagePath,
	isSvgPath,
	svgDataUrl,
} from './imagePreview';
import {bytesToBase64} from './base64';

describe('getImageMimeType', () => {
	it('recognizes image extensions case-insensitively', () => {
		expect(getImageMimeType('assets/logo.SVG')).toBe('image/svg+xml');
		expect(getImageMimeType('a/b/photo.jpeg')).toBe('image/jpeg');
		expect(getImageMimeType('favicon.ico')).toBe('image/x-icon');
	});

	it('returns null for other files', () => {
		expect(getImageMimeType('src/main.ts')).toBeNull();
		expect(getImageMimeType('png')).toBeNull();
		expect(getImageMimeType('.png')).toBeNull();
		expect(getImageMimeType('dir.png/readme')).toBeNull();
	});
});

describe('image kinds', () => {
	it('tells SVG from raster images', () => {
		expect(isSvgPath('icon.svg')).toBe(true);
		expect(isRasterImagePath('icon.svg')).toBe(false);
		expect(isRasterImagePath('icon.png')).toBe(true);
		expect(isRasterImagePath('icon.ts')).toBe(false);
	});
});

describe('data URLs', () => {
	it('builds a base64 data URL', () => {
		expect(base64DataUrl('image/png', 'iVBO')).toBe('data:image/png;base64,iVBO');
	});

	it('percent-encodes SVG source including non-ASCII text', () => {
		expect(svgDataUrl('<svg>č</svg>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%3E%C4%8D%3C%2Fsvg%3E');
	});
});

describe('sizes', () => {
	it('computes the decoded size of base64 content', () => {
		expect(formatBase64Size(bytesToBase64(new Uint8Array(5)))).toBe('5 B');
		expect(formatBase64Size(bytesToBase64(new Uint8Array(3)))).toBe('3 B');
		expect(formatBase64Size(bytesToBase64(new Uint8Array(2048)))).toBe('2.0 KB');
	});

	it('formats byte counts', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
	});
});

describe('bytesToBase64', () => {
	it('matches the RFC 4648 vectors', () => {
		expect(bytesToBase64(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
		expect(bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]))).toBe('iVBORwD/');
	});

	it('handles content larger than one chunk', () => {
		const bytes = new Uint8Array(100_000).map((_, i) => i % 256);

		expect(atob(bytesToBase64(bytes)).length).toBe(100_000);
	});
});
