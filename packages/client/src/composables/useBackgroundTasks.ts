import {ref, computed, readonly} from 'vue';

export interface IBackgroundTask {
	id: number;
	label: string;
}

// A task that finishes sooner never reaches the indicator: a fast local operation would only
// make it flash.
const SHOW_DELAY_MS = 300;

const tasks = ref<IBackgroundTask[]>([]);

let nextId = 0;

/**
 * Running long operations (pull, push, merge, …) shown by the global activity indicator in
 * the bottom-left corner. `track` wraps the work, so a task is removed however it ends.
 */
export function useBackgroundTasks() {
	async function track<T>(label: string, work: () => Promise<T>): Promise<T> {
		const id = ++nextId;
		const timer = setTimeout(() => {
			tasks.value = [...tasks.value, {id, label}];
		}, SHOW_DELAY_MS);

		try {
			return await work();
		}
		finally {
			clearTimeout(timer);
			tasks.value = tasks.value.filter(t => t.id !== id);
		}
	}

	return {
		tasks: readonly(tasks),
		isBusy: computed(() => tasks.value.length > 0),
		track,
	};
}
