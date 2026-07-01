import {ref} from 'vue';
import type {Ref} from 'vue';

const SETTINGS_KEY = 'git-yak:graphSettings';
const LAYOUT_KEY = 'git-yak:graphLayout';

export interface INodeLayout {
	x: number;
	y: number;
	pinned: boolean;
}

export interface IGraphView {
	scale: number;
	panX: number;
	panY: number;
}

export interface IGraphSettings {
	repulsion?: number;
	gather?: number;
	view?: IGraphView;
}

export interface IUseGraphSettings {
	repulsion: Ref<number>;
	gather: Ref<number>;
	loadView: () => IGraphView | undefined;
	loadLayout: () => Record<string, INodeLayout>;
	saveState: (view: IGraphView, layout: Record<string, INodeLayout>) => void;
	clearLayout: () => void;
}

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);

		return raw ? (JSON.parse(raw) as T) : fallback;
	}
	catch {
		return fallback;
	}
}

function write(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	}
	catch {
		console.error('localStorage is not available');
	}
}

const stored = read<IGraphSettings>(SETTINGS_KEY, {});
const repulsion = ref(stored.repulsion ?? 500);
const gather = ref(stored.gather ?? 0.08);

export const useGraphSettings: () => IUseGraphSettings = () => {
	function loadView(): IGraphView | undefined {
		return read<IGraphSettings>(SETTINGS_KEY, {}).view;
	}

	function loadLayout(): Record<string, INodeLayout> {
		return read<Record<string, INodeLayout>>(LAYOUT_KEY, {});
	}

	function saveState(view: IGraphView, layout: Record<string, INodeLayout>): void {
		write(SETTINGS_KEY, {repulsion: repulsion.value, gather: gather.value, view});
		write(LAYOUT_KEY, layout);
	}

	function clearLayout(): void {
		write(LAYOUT_KEY, {});
	}

	const instance: IUseGraphSettings = {repulsion, gather, loadView, loadLayout, saveState, clearLayout};

	return instance;
};
