import {ref, readonly} from 'vue';

const loading = ref(false);
const selectedFilePath = ref<string | null>(null);
const activePanelWidth = ref(320);
const sidebarCollapsed = ref(false);
const showActivityLog = ref(false);
const showSettings = ref(false);

export function useLayout() {
	function setLoading(value: boolean): void {
		loading.value = value;
	}

	function collapseSidebar(): void {
		sidebarCollapsed.value = true;
	}

	function expandSidebar(): void {
		sidebarCollapsed.value = false;
	}

	function openFileDiff(filePath: string): void {
		selectedFilePath.value = filePath;
		collapseSidebar();
	}

	function closeFileDiff(): void {
		selectedFilePath.value = null;
		expandSidebar();
	}

	function toggleActivityLog(): void {
		showActivityLog.value = !showActivityLog.value;
	}

	function toggleSettings(): void {
		showSettings.value = !showSettings.value;
	}

	return {
		loading: readonly(loading),
		selectedFilePath: readonly(selectedFilePath),
		sidebarCollapsed: readonly(sidebarCollapsed),
		activePanelWidth,
		showActivityLog,
		showSettings,
		setLoading,
		openFileDiff,
		closeFileDiff,
		collapseSidebar,
		expandSidebar,
		toggleActivityLog,
		toggleSettings,
	};
}
