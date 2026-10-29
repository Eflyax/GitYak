import {defineComponent} from 'vue';
import {NSelect} from 'naive-ui';
import type {SelectGroupOption, SelectOption} from 'naive-ui';
import type {IThemeEntry} from '@/domain/models/Theme';
import {useTheme} from '@/composables/useTheme';

const {availableThemes, activeTheme, applyTheme} = useTheme();

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
