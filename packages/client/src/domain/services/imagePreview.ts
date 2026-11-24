const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	bmp: 'image/bmp',
	ico: 'image/x-icon',
};

function extension(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');

	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** MIME type of an image the webview can display, judged by the file extension; null otherwise. */
export function getImageMimeType(path: string): string | null {
	return IMAGE_MIME_TYPES[extension(path)] ?? null;
}

/** SVG is text: its source goes in the diff editor and its rendering in the preview. */
export function isSvgPath(path: string): boolean {
	return extension(path) === 'svg';
}

/** Images other than SVG are binary: they get only a preview, as their bytes are not text. */
export function isRasterImagePath(path: string): boolean {
	return getImageMimeType(path) !== null && !isSvgPath(path);
}

export function base64DataUrl(mimeType: string, base64: string): string {
	return `data:${mimeType};base64,${base64}`;
}

/** Data URL of SVG source; percent-encoding keeps non-ASCII text intact, unlike btoa. */
export function svgDataUrl(source: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

/** Human-readable size of base64-encoded content, e.g. "12.4 KB". */
export function formatBase64Size(base64: string): string {
	const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);

	return formatBytes(Math.floor(base64.length * 3 / 4) - padding);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
