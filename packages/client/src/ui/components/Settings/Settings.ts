import {defineComponent} from 'vue';
import {NAutoComplete, NInput, NInputNumber, NSelect, NSwitch} from 'naive-ui';
import type {AutoCompleteOption, SelectOption} from 'naive-ui';
import {invoke} from '@tauri-apps/api/core';
import ThemeSelector from '@/ui/components/ThemeSelector/ThemeSelector.vue';
import {useTheme} from '@/composables/useTheme';
import {useSshProxyJump} from '@/composables/useSshProxyJump';
import {useNotify} from '@/composables/useNotify';
import {useHistorySettings, clampPageSize, clampMaxCommits, PAGE_SIZE_MIN, PAGE_SIZE_MAX} from '@/composables/useHistorySettings';
import type {ISshProxyJumpConfig, TSshProxyJumpTextField} from '@/domain/models/SshProxyJump';
import {useDateFormat} from '@/composables/useDateFormat';
import {DATE_FORMATS, formatGitDate} from '@/domain/services/dateFormat';
import type {TDateFormat} from '@/domain/services/dateFormat';

const
	{themesDir, availableThemes, loadThemes} = useTheme(),
	sshProxyJump = useSshProxyJump(),
	historySettings = useHistorySettings(),
	{dateFormat} = useDateFormat(),
	isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const DATE_FORMAT_SAMPLE = '2026-11-03 14:05';

export default defineComponent({
	components: {
		NAutoComplete,
		NInput,
		NInputNumber,
		NSelect,
		NSwitch,
		ThemeSelector,
	},

	setup() {
		return {notify: useNotify()};
	},

	data() {
		return {
			isTauri,
			pageSizeMin: PAGE_SIZE_MIN,
			pageSizeMax: PAGE_SIZE_MAX,
			proxyJumpBusy: false,
			detectedKeys: [] as Array<string>,
		};
	},

	computed: {
		themesDir(): string {
			return themesDir.value;
		},

		historyPageSize(): number {
			return historySettings.pageSize.value;
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
				label: `${f.label} — ${formatGitDate(DATE_FORMAT_SAMPLE, f.value)}`,
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

		errorMessage(err: unknown): string {
			return err instanceof Error ? err.message : String(err);
		},
	},
});
