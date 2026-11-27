import {ref, watch} from 'vue';
import type {Ref} from 'vue';
import {clampRecentCount} from '@/domain/services/projectManager';

const SETTINGS_KEY = 'git-yak:projectSettings';

export interface IProjectSettings {
	recentCount?: number;
}

export interface IUseProjectSettings {
	/** How many recently opened projects the project manager shows. */
	recentCount: Ref<number>;
}

function read(): IProjectSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);

		return raw ? (JSON.parse(raw) as IProjectSettings) : {};
	}
	catch {
		return {};
	}
}

function write(value: IProjectSettings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
	}
	catch {
		console.error('localStorage is not available');
	}
}

const recentCount = ref(clampRecentCount(read().recentCount));

watch(recentCount, count => {
	write({recentCount: count});
});

export const useProjectSettings: () => IUseProjectSettings = () => ({recentCount});
