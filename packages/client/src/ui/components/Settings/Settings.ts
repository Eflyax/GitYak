import {defineComponent} from 'vue';
import {NAutoComplete, NInput, NInputNumber, NSwitch} from 'naive-ui';
import type {AutoCompleteOption} from 'naive-ui';
import {invoke} from '@tauri-apps/api/core';
import ThemeSelector from '@/ui/components/ThemeSelector/ThemeSelector.vue';
import {useTheme} from '@/composables/useTheme';
import {useSshProxyJump} from '@/composables/useSshProxyJump';
import {useNotify} from '@/composables/useNotify';
import type {ISshProxyJumpConfig, TSshProxyJumpTextField} from '@/domain/models/SshProxyJump';

const
	{themesDir, availableThemes, loadThemes} = useTheme(),
	sshProxyJump = useSshProxyJump(),
	isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export default defineComponent({
	components: {
		NAutoComplete,
		NInput,
		NInputNumber,
		NSwitch,
		ThemeSelector,
	},

	setup() {
		return {notify: useNotify()};
	},

	data() {
		return {
			isTauri,
			proxyJumpBusy: false,
			detectedKeys: [] as Array<string>,
		};
	},

	computed: {
		themesDir(): string {
			return themesDir.value;
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
