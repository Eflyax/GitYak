import {defineComponent, nextTick} from 'vue';
import {NModal, NInput} from 'naive-ui';
import {useCommands} from '@/composables/useCommands';
import type {ICommand, ISubItem} from '@/composables/useCommands';

const MAX_RESULTS = 10;

const {allCommands, paletteOpen, executeCommand, closePalette} = useCommands();

export default defineComponent({
	components: {NModal, NInput},

	data() {
		return {
			query: '',
			activeIndex: 0,
			activeCommand: null as ICommand | null,
			subItems: [] as Array<ISubItem>,
		};
	},

	computed: {
		paletteOpen(): boolean {
			return paletteOpen.value;
		},

		inputPlaceholder(): string {
			if (this.activeCommand) {
				return `${this.activeCommand.label}: type to filter…`;
			}

			return 'Type a command…';
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
				this.activeCommand = null;
				this.subItems = [];
				nextTick(() => {
					const input = this.$refs['inputRef'] as {focus?: () => void} | undefined;
					input?.focus?.();
				});
			}
		},

		query(q: string): void {
			if (this.activeCommand?.getItems) {
				this.subItems = this.activeCommand.getItems(q);
				this.activeIndex = 0;
			}
		},
	},

	methods: {
		isCommandEnabled(cmd: ICommand): boolean {
			return cmd.isEnabled?.() ?? true;
		},

		onQueryUpdate(value: string): void {
			this.query = value;
			if (!this.activeCommand) {
				this.activeIndex = 0;
			}
		},

		onItemHover(index: number): void {
			this.activeIndex = index;
		},

		onItemClick(cmd: ICommand): void {
			if (!this.isCommandEnabled(cmd)) {
				return;
			}

			if (cmd.getItems) {
				this.activeCommand = cmd;
				this.query = '';
				this.subItems = cmd.getItems('');
				this.activeIndex = 0;
				nextTick(() => {
					const input = this.$refs['inputRef'] as {focus?: () => void} | undefined;
					input?.focus?.();
				});
				return;
			}

			executeCommand(cmd.id);
			closePalette();
		},

		onSubItemClick(item: ISubItem): void {
			item.action();
			closePalette();
			this.activeCommand = null;
		},

		onModalUpdate(show: boolean): void {
			if (!show) {
				closePalette();
				this.query = '';
				this.activeCommand = null;
				this.subItems = [];
			}
		},

		onKeydown(event: KeyboardEvent): void {
			const listLength = this.activeCommand ? this.subItems.length : this.filteredCommands.length;

			if (event.key === 'ArrowDown') {
				event.preventDefault();
				this.activeIndex = Math.min(this.activeIndex + 1, listLength - 1);
				return;
			}

			if (event.key === 'ArrowUp') {
				event.preventDefault();
				this.activeIndex = Math.max(this.activeIndex - 1, 0);
				return;
			}

			if (event.key === 'Enter') {
				if (this.activeCommand) {
					const item = this.subItems[this.activeIndex];

					if (item) {
						this.onSubItemClick(item);
					}

					return;
				}

				const cmd = this.filteredCommands[this.activeIndex];

				if (cmd && this.isCommandEnabled(cmd)) {
					this.onItemClick(cmd);
				}

				return;
			}

			if (event.key === 'Escape') {
				if (this.activeCommand) {
					this.activeCommand = null;
					this.query = '';
					this.subItems = [];
					this.activeIndex = 0;
					return;
				}

				closePalette();
			}
		},
	},
});
