import {defineComponent} from 'vue';
import {NSelect} from 'naive-ui';
import {useTheme} from '@/composables/useTheme';

const {availableThemes, activeTheme, applyTheme} = useTheme();

export default defineComponent({
	components: {NSelect},

	computed: {
		options(): Array<{label: string; value: string}> {
			return availableThemes.value.map(t => ({
				label: t.name,
				value: t.filePath,
			}));
		},

		selectedPath(): string | undefined {
			return activeTheme.value?.filePath;
		},
	},

	methods: {
		async onSelect(path: string): Promise<void> {
			await applyTheme(path);
		},
	},
});
