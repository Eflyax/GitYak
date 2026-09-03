import ContextMenu from '@imengyu/vue3-context-menu';
import {useWorkingTree} from '@/composables/useWorkingTree';
import type {IMenuDeps} from '@/composables/useContextMenu';

export function useFileMenu(deps: IMenuDeps) {
	const {discardFile} = useWorkingTree();

	function contextMenuFile(e: MouseEvent, filePath: string) {
		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			theme: deps.THEME,
			items: deps.withHeader(filePath.split('/').pop() ?? filePath, [
				{
					label: 'Delete file',
					icon: deps.menuIcon('mdi-trash-can'),
					onClick: async () => {
						await discardFile(filePath);
					},
				},
			]),
		});
	}

	return {contextMenuFile};
}
