import {ref, watch} from 'vue';
import type {Ref} from 'vue';

const SETTINGS_KEY = 'git-yak:historySettings';

export const PAGE_SIZE_MIN = 100;
export const PAGE_SIZE_MAX = 5000;

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_COMMITS = 10000;

export interface IHistorySettings {
	pageSize?: number;
	maxCommits?: number;
}

export interface IUseHistorySettings {
	/** Commits fetched by one `git log`: the first screen, then each page loaded on scroll. */
	pageSize: Ref<number>;
	/** Upper bound on the commits the history ever holds; 0 means no limit. */
	maxCommits: Ref<number>;
}

function read(): IHistorySettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);

		return raw ? (JSON.parse(raw) as IHistorySettings) : {};
	}
	catch {
		return {};
	}
}

function write(value: IHistorySettings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
	}
	catch {
		console.error('localStorage is not available');
	}
}

export function clampPageSize(value: number | undefined): number {
	if (!value || !Number.isFinite(value)) {
		return DEFAULT_PAGE_SIZE;
	}

	return Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, Math.round(value)));
}

export function clampMaxCommits(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value) || value < 0) {
		return DEFAULT_MAX_COMMITS;
	}

	return Math.round(value);
}

const stored = read();
const pageSize = ref(clampPageSize(stored.pageSize));
const maxCommits = ref(clampMaxCommits(stored.maxCommits));

watch([pageSize, maxCommits], ([size, max]) => {
	write({pageSize: size, maxCommits: max});
});

export const useHistorySettings: () => IUseHistorySettings = () => ({pageSize, maxCommits});
