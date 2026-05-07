import {defineComponent} from 'vue';
import {NInput} from 'naive-ui';
import ThemeSelector from '@/ui/components/ThemeSelector/ThemeSelector.vue';
import {useTheme} from '@/composables/useTheme';

const {themesDir, loadThemes} = useTheme();

export default defineComponent({
	components: {
		NInput,
		ThemeSelector,
	},

	computed: {
		themesDir(): string {
			return themesDir.value;
		},
	},

	methods: {
		onThemesDirInput(value: string): void {
			themesDir.value = value;
		},

		async onThemesDirBlur(): Promise<void> {
			await loadThemes(themesDir.value);
		},
	},
});
