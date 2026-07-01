import {ref, readonly} from 'vue';

const loading = ref(false);
const selectedFilePath = ref<string | null>(null);
const activePanelWidth = ref(320);
const sidebarCollapsed = ref(false);
const showActivityLog = ref(false);
const showSettings = ref(false);
const showGraph = ref(false);
const tooltipsPinned = ref(false);

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

	function toggleGraph(): void {
		showGraph.value = !showGraph.value;
	}

	function toggleTooltips(): void {
		tooltipsPinned.value = !tooltipsPinned.value;
	}

	return {
		loading: readonly(loading),
		selectedFilePath: readonly(selectedFilePath),
		sidebarCollapsed: readonly(sidebarCollapsed),
		activePanelWidth,
		showActivityLog,
		showSettings,
		showGraph,
		tooltipsPinned: readonly(tooltipsPinned),
		setLoading,
		openFileDiff,
		closeFileDiff,
		collapseSidebar,
		expandSidebar,
		toggleActivityLog,
		toggleSettings,
		toggleGraph,
		toggleTooltips,
	};
}
