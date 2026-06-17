import {ref, readonly} from 'vue';

export interface IDragRef {
	type: 'branch' | 'tag';
	name: string;
}

const dragSource = ref<IDragRef | null>(null);

export function useDragRef() {
	function startDrag(source: IDragRef): void {
		dragSource.value = source;
	}

	function endDrag(): void {
		dragSource.value = null;
	}

	return {
		dragSource: readonly(dragSource),
		startDrag,
		endDrag,
	};
}
