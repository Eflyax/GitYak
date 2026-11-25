import {parseRelease, parseReleaseIndex} from '@git-yak/protocol';
import type {IRelease, IReleaseIndex} from '@git-yak/protocol';

// Same origin as the site: nginx serves the manifests CI publishes under /releases/.
export async function fetchLatestRelease(): Promise<IRelease> {
	return parseRelease(await fetchJson('/releases/latest.json'));
}

export async function fetchReleaseIndex(): Promise<IReleaseIndex> {
	return parseReleaseIndex(await fetchJson('/releases/index.json'));
}

async function fetchJson(url: string): Promise<unknown> {
	const response = await fetch(url, {cache: 'no-cache'});

	if (!response.ok) {
		throw new Error(`${url}: ${response.status}`);
	}

	return response.json();
}

export function formatSize(bytes: number): string {
	return bytes >= 1024 * 1024
		? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDate(iso: string): string {
	const date = new Date(iso);

	return Number.isNaN(date.getTime())
		? ''
		: date.toLocaleDateString('en', {year: 'numeric', month: 'long', day: 'numeric'});
}

/** Builds an element; children are text unless already a Node, so nothing is parsed as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attributes: Record<string, string> = {},
	...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);

	Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
	element.append(...children);

	return element;
}
