/** The last folder the file browser was in, per connection key (see `connectionKey`). */
export type TBrowseHistory = Readonly<Record<string, string>>;

export function parseBrowseHistory(raw: string | null): TBrowseHistory {
	if (!raw) return {};

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	}
	catch {
		return {};
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

	const history: Record<string, string> = {};

	for (const [key, value] of Object.entries(parsed)) {
		if (typeof value === 'string') history[key] = value;
	}

	return history;
}

export function rememberFolder(history: TBrowseHistory, key: string, path: string): TBrowseHistory {
	return {...history, [key]: path};
}

/** An explicit path wins over the remembered folder; with neither, start at the root. */
export function startFolder(history: TBrowseHistory, key: string, requested?: string): string {
	return requested || history[key] || '/';
}
