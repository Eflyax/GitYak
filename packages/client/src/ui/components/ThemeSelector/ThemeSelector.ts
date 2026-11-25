import {defineComponent} from 'vue';
import {NSelect} from 'naive-ui';
import type {SelectGroupOption, SelectOption} from 'naive-ui';
import type {IThemeEntry} from '@/domain/models/Theme';
import {useTheme} from '@/composables/useTheme';
import {useThemeEditor} from '@/composables/useThemeEditor';

const
	{availableThemes, activeTheme, applyTheme} = useTheme(),
	{isEditorOpen} = useThemeEditor();

export default defineComponent({
	components: {NSelect},

	computed: {
		options(): Array<SelectOption | SelectGroupOption> {
			const
				builtin = availableThemes.value.filter(t => t.isBuiltin).map(this.toOption),
				custom = availableThemes.value.filter(t => !t.isBuiltin).map(this.toOption);

			if (!custom.length) {
				return builtin;
			}

			return [
				{
					type: 'group',
					key: 'builtin',
					label: 'Built-in',
					children: builtin,
				},
				{
					type: 'group',
					key: 'custom',
					label: 'Custom',
					children: custom,
				},
			];
		},

		// Switching themes mid-edit would drop the live preview; finish or cancel the edit first.
		isEditorOpen(): boolean {
			return isEditorOpen.value;
		},

		selectedPath(): string | undefined {
			return activeTheme.value?.filePath;
		},
	},

	methods: {
		toOption(theme: IThemeEntry): SelectOption {
			return {
				label: theme.name,
				value: theme.filePath,
			};
		},

		async onSelect(path: string): Promise<void> {
			await applyTheme(path);
		},
	},
});
