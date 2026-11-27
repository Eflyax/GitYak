import {parseBrowseHistory, rememberFolder, startFolder} from '@/domain/services/browseHistory';

const STORAGE_KEY = 'git-yak:browseHistory';

function load() {
	return parseBrowseHistory(localStorage.getItem(STORAGE_KEY));
}

export function useBrowseHistory() {
	function start(key: string, requested?: string): string {
		return startFolder(load(), key, requested);
	}

	function remember(key: string, path: string): void {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rememberFolder(load(), key, path)));
	}

	return {start, remember};
}
