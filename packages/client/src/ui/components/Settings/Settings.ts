import {defineComponent, h, ref} from 'vue';
import {NAutoComplete, NButton, NDynamicTags, NInput, NInputNumber, NLayout, NLayoutContent, NLayoutSider, NMenu, NProgress, NSelect, NSwitch} from 'naive-ui';
import type {AutoCompleteOption, MenuOption, SelectOption} from 'naive-ui';
import Icon from '@/ui/components/Icon.vue';
import {invoke} from '@tauri-apps/api/core';
import {isTauri as isTauriRuntime} from '@/infrastructure/tauri/isTauri';
import ThemeSelector from '@/ui/components/ThemeSelector/ThemeSelector.vue';
import {useTheme} from '@/composables/useTheme';
import {useSshProxyJump} from '@/composables/useSshProxyJump';
import {useNotify} from '@/composables/useNotify';
import {useProjectSettings} from '@/composables/useProjectSettings';
import {clampRecentCount} from '@/domain/services/projectManager';
import {useHistorySettings, clampPageSize, clampMaxCommits, PAGE_SIZE_MIN, PAGE_SIZE_MAX} from '@/composables/useHistorySettings';
import type {ISshProxyJumpConfig, TSshProxyJumpTextField} from '@/domain/models/SshProxyJump';
import {useDateFormat} from '@/composables/useDateFormat';
import {useTemplates} from '@/composables/useTemplates';
import {normalizeTemplates} from '@/domain/services/templates';
import {useThemeEditor} from '@/composables/useThemeEditor';
import {useLayout} from '@/composables/useLayout';
import {DATE_FORMATS, formatGitDate} from '@/domain/services/dateFormat';
import type {TDateFormat} from '@/domain/services/dateFormat';
import {APP_VERSION, useUpdateCheck} from '@/composables/useUpdateCheck';
import type {TUpdateCheckStatus} from '@/composables/useUpdateCheck';
import {useUpdateInstall} from '@/composables/useUpdateInstall';
import {formatProgress} from '@/domain/services/updateProgress';
import type {TUpdatePhase} from '@/domain/services/updateProgress';
import {DOWNLOAD_PAGE_URL, WEBSITE_URL} from '@/domain/services/updates';
import type {IAvailableUpdate} from '@/domain/services/updates';
import {openExternal} from '@/infrastructure/openExternal';

const
	{themesDir, availableThemes, activeTheme, loadThemes} = useTheme(),
	themeEditor = useThemeEditor(),
	{showSettings} = useLayout(),
	sshProxyJump = useSshProxyJump(),
	historySettings = useHistorySettings(),
	projectSettings = useProjectSettings(),
	{dateFormat} = useDateFormat(),
	{globalCommitTemplate, globalBranchTemplates} = useTemplates(),
	updateCheck = useUpdateCheck(),
	updateInstall = useUpdateInstall(),
	isTauri = isTauriRuntime;

const DATE_FORMAT_SAMPLE = '2026-11-03 14:05';

type TSettingsSection = 'appearance' | 'dates' | 'history' | 'projects' | 'templates' | 'proxyJump' | 'about';

interface ISettingsSection {
	key: TSettingsSection
	label: string
	icon: string
	/** Shown only in the desktop app. */
	tauriOnly?: boolean
}

const SECTIONS: ReadonlyArray<ISettingsSection> = [
	{key: 'appearance', label: 'Appearance', icon: 'mdi-palette-outline'},
	{key: 'dates', label: 'Date & Time', icon: 'mdi-calendar-clock-outline'},
	{key: 'history', label: 'History', icon: 'mdi-history'},
	{key: 'projects', label: 'Projects', icon: 'mdi-source-repository'},
	{key: 'templates', label: 'Templates', icon: 'mdi-text-box-edit-outline'},
	{key: 'proxyJump', label: 'SSH ProxyJump', icon: 'mdi-server-network', tauriOnly: true},
	{key: 'about', label: 'About & Updates', icon: 'mdi-information-outline'},
];

const visibleSections = SECTIONS.filter(section => !section.tauriOnly || isTauri);

// Module scope: reopening Settings returns to the section (and menu width) last used.
const
	activeSection = ref<TSettingsSection>('appearance'),
	menuCollapsed = ref(false);

function renderIcon(name: string): () => ReturnType<typeof h> {
	return () => h(Icon, {name, style: {width: '1em', height: '1em'}});
}

export default defineComponent({
	components: {
		NAutoComplete,
		NButton,
		NDynamicTags,
		NInput,
		NInputNumber,
		NLayout,
		NLayoutContent,
		NLayoutSider,
		NMenu,
		NProgress,
		NSelect,
		NSwitch,
		ThemeSelector,
	},

	setup() {
		return {notify: useNotify(), activeSection, menuCollapsed};
	},

	data() {
		return {
			isTauri,
			appVersion: APP_VERSION,
			websiteUrl: WEBSITE_URL,
			pageSizeMin: PAGE_SIZE_MIN,
			pageSizeMax: PAGE_SIZE_MAX,
			proxyJumpBusy: false,
			detectedKeys: [] as Array<string>,
			// Name typed for a theme copy; null while the name field is hidden.
			copyName: null as string | null,
		};
	},

	computed: {
		menuOptions(): Array<MenuOption> {
			return visibleSections.map(section => ({
				key: section.key,
				label: section.label,
				icon: renderIcon(section.icon),
			}));
		},

		activeSectionLabel(): string {
			return SECTIONS.find(section => section.key === this.activeSection)?.label ?? '';
		},

		isEditorOpen(): boolean {
			return themeEditor.isEditorOpen.value;
		},

		hasActiveTheme(): boolean {
			return activeTheme.value !== undefined;
		},

		canEditActive(): boolean {
			return themeEditor.canEditActive.value;
		},

		themesDir(): string {
			return themesDir.value;
		},

		historyPageSize(): number {
			return historySettings.pageSize.value;
		},

		recentCount(): number {
			return projectSettings.recentCount.value;
		},

		commitTemplate(): string {
			return globalCommitTemplate.value;
		},

		branchTemplates(): Array<string> {
			return globalBranchTemplates.value;
		},

		historyMaxCommits(): number {
			return historySettings.maxCommits.value;
		},

		dateFormat(): TDateFormat {
			return dateFormat.value;
		},

		// Each option shows a sample, so the choice does not need a separate preview.
		dateFormatOptions(): Array<SelectOption> {
			return DATE_FORMATS.map(f => ({
				label: `${f.label} - ${formatGitDate(DATE_FORMAT_SAMPLE, f.value)}`,
				value: f.value,
			}));
		},

		customThemesCount(): number {
			return availableThemes.value.filter(t => !t.isBuiltin).length;
		},

		proxyJump(): ISshProxyJumpConfig {
			return sshProxyJump.config.value;
		},

		proxyJumpEnabled(): boolean {
			return sshProxyJump.enabled.value;
		},

		autoCheckUpdates(): boolean {
			return updateCheck.autoCheck.value;
		},

		updateStatus(): TUpdateCheckStatus {
			return updateCheck.status.value;
		},

		availableUpdate(): Readonly<IAvailableUpdate> | null {
			return updateCheck.update.value;
		},

		updatePhase(): TUpdatePhase {
			return updateInstall.phase.value;
		},

		/** True when the app can download and install the available update itself. */
		canSelfUpdate(): boolean {
			return !!this.availableUpdate && this.availableUpdate.install.kind !== 'none';
		},

		/** An in-app update is downloading, ready or installing: a re-check would only get in the way. */
		updateBusy(): boolean {
			const phase = this.updatePhase.phase;

			return phase === 'downloading' || phase === 'ready' || phase === 'installing';
		},

		updateProgressPercent(): number {
			const phase = this.updatePhase;

			return phase.phase === 'downloading' && phase.total
				? Math.min(100, Math.round(phase.downloaded / phase.total * 100))
				: 0;
		},

		updateProgressText(): string {
			const phase = this.updatePhase;

			return phase.phase === 'downloading' ? formatProgress(phase.downloaded, phase.total) : '';
		},

		updateError(): string {
			return updateCheck.errorMessage.value;
		},

		identityFileOptions(): Array<AutoCompleteOption> {
			return this.detectedKeys.map(key => ({
				label: key,
				value: key,
			}));
		},
	},

	async mounted() {
		if (!isTauri) {
			return;
		}

		await Promise.all([this.refreshProxyJump(), this.detectKeys()]);
	},

	methods: {
		onSectionSelect(key: string): void {
			this.activeSection = key as TSettingsSection;
		},

		async onCopyClick(): Promise<void> {
			this.copyName = `${activeTheme.value?.meta.name ?? 'Theme'} (copy)`;
			await this.$nextTick();
			(this.$refs.copyNameInput as InstanceType<typeof NInput> | undefined)?.select();
		},

		async onCopyConfirm(): Promise<void> {
			if (!this.copyName?.trim()) {
				return;
			}

			try {
				await themeEditor.startCopy(this.copyName);
				this.copyName = null;
				// The bar edits the theme live; the app has to be visible behind it.
				showSettings.value = false;
			}
			catch (err: unknown) {
				this.notify.error(this.errorMessage(err));
			}
		},

		async onEditClick(): Promise<void> {
			try {
				await themeEditor.startEdit();
				showSettings.value = false;
			}
			catch (err: unknown) {
				this.notify.error(this.errorMessage(err));
			}
		},

		onThemesDirInput(value: string): void {
			themesDir.value = value;
		},

		async onThemesDirBlur(): Promise<void> {
			await loadThemes(themesDir.value);
		},

		onDateFormatInput(value: TDateFormat): void {
			dateFormat.value = value;
		},

		onPageSizeInput(value: number | null): void {
			historySettings.pageSize.value = clampPageSize(value ?? undefined);
		},

		onRecentCountInput(value: number | null): void {
			projectSettings.recentCount.value = clampRecentCount(value ?? undefined);
		},

		onCommitTemplateInput(value: string): void {
			globalCommitTemplate.value = value;
		},

		onBranchTemplatesInput(value: Array<string>): void {
			globalBranchTemplates.value = normalizeTemplates(value);
		},

		onMaxCommitsInput(value: number | null): void {
			historySettings.maxCommits.value = clampMaxCommits(value ?? 0);
		},

		async refreshProxyJump(): Promise<void> {
			try {
				await sshProxyJump.refresh();
			}
			catch (err: unknown) {
				this.notify.error(`Cannot read ~/.ssh/config: ${this.errorMessage(err)}`);
			}
		},

		async detectKeys(): Promise<void> {
			try {
				this.detectedKeys = await invoke<Array<string>>('detect_ssh_keys');
			}
			catch {
				// Key suggestions are a convenience; the path can always be typed in.
			}
		},

		showIdentityFileOptions(): boolean {
			return this.detectedKeys.length > 0;
		},

		onProxyJumpInput(field: TSshProxyJumpTextField, value: string): void {
			sshProxyJump.config.value[field] = value;
		},

		onProxyJumpPortInput(value: number | null): void {
			sshProxyJump.config.value.jumpPort = value ?? undefined;
		},

		async onProxyJumpBlur(): Promise<void> {
			try {
				await sshProxyJump.saveConfig();
			}
			catch (err: unknown) {
				this.notify.error(`ProxyJump not updated: ${this.errorMessage(err)}`);
			}
		},

		async onProxyJumpToggle(value: boolean): Promise<void> {
			this.proxyJumpBusy = true;

			try {
				if (value) {
					await sshProxyJump.enable();
					this.notify.success('ProxyJump enabled in ~/.ssh/config');
				}
				else {
					await sshProxyJump.disable();
					this.notify.success('ProxyJump removed from ~/.ssh/config');
				}
			}
			catch (err: unknown) {
				this.notify.error(this.errorMessage(err));
			}
			finally {
				this.proxyJumpBusy = false;
			}
		},

		onAutoCheckUpdatesInput(value: boolean): void {
			updateCheck.autoCheck.value = value;
		},

		async onCheckUpdatesClick(): Promise<void> {
			await updateCheck.checkForUpdates({includeSkipped: true});
		},

		async onDownloadUpdateClick(): Promise<void> {
			// After a failed re-check there is no update object; the download page still helps.
			await this.openUrl(this.availableUpdate?.downloadUrl ?? DOWNLOAD_PAGE_URL);
		},

		async onInstallUpdateClick(): Promise<void> {
			if (this.availableUpdate) {
				await updateInstall.startUpdate(this.availableUpdate);
			}
		},

		async onRestartUpdateClick(): Promise<void> {
			await updateInstall.restartToUpdate();
		},

		async onReleaseNotesClick(): Promise<void> {
			if (this.availableUpdate) {
				await this.openUrl(this.availableUpdate.releaseNotesUrl);
			}
		},

		async openUrl(url: string): Promise<void> {
			try {
				await openExternal(url);
			}
			catch (err: unknown) {
				this.notify.error(`Cannot open ${url}: ${this.errorMessage(err)}`);
			}
		},

		errorMessage(err: unknown): string {
			return err instanceof Error ? err.message : String(err);
		},
	},
});
