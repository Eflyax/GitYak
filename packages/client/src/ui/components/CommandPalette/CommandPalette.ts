import {defineComponent, nextTick} from 'vue';
import {NModal, NInput} from 'naive-ui';
import {useCommands} from '@/composables/useCommands';
import type {ICommand} from '@/composables/useCommands';

const MAX_RESULTS = 10;

const {allCommands, paletteOpen, executeCommand, closePalette} = useCommands();

export default defineComponent({
	components: {NModal, NInput},

	data() {
		return {
			query: '',
			activeIndex: 0,
		};
	},

	computed: {
		paletteOpen(): boolean {
			return paletteOpen.value;
		},

		filteredCommands(): Array<ICommand> {
			const q = this.query.toLowerCase().trim();

			if (!q) {
				return allCommands.value.slice(0, MAX_RESULTS);
			}

			return allCommands.value
				.filter(cmd => cmd.label.toLowerCase().includes(q))
				.slice(0, MAX_RESULTS);
		},
	},

	watch: {
		paletteOpen(open: boolean): void {
			if (open) {
				this.query = '';
				this.activeIndex = 0;
				nextTick(() => {
					const input = this.$refs['inputRef'] as {focus?: () => void} | undefined;
					input?.focus?.();
				});
			}
		},
	},

	methods: {
		isCommandEnabled(cmd: ICommand): boolean {
			return cmd.isEnabled?.() ?? true;
		},

		onQueryUpdate(value: string): void {
			this.query = value;
			this.activeIndex = 0;
		},

		onItemHover(index: number): void {
			this.activeIndex = index;
		},

		onItemClick(cmd: ICommand): void {
			if (!this.isCommandEnabled(cmd)) {
				return;
			}

			executeCommand(cmd.id);
			closePalette();
		},

		onModalUpdate(show: boolean): void {
			if (!show) {
				closePalette();
				this.query = '';
			}
		},

		onKeydown(event: KeyboardEvent): void {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				this.activeIndex = Math.min(this.activeIndex + 1, this.filteredCommands.length - 1);
				return;
			}

			if (event.key === 'ArrowUp') {
				event.preventDefault();
				this.activeIndex = Math.max(this.activeIndex - 1, 0);
				return;
			}

			if (event.key === 'Enter') {
				const cmd = this.filteredCommands[this.activeIndex];

				if (cmd && this.isCommandEnabled(cmd)) {
					executeCommand(cmd.id);
					closePalette();
				}

				return;
			}

			if (event.key === 'Escape') {
				closePalette();
			}
		},
	},
});
