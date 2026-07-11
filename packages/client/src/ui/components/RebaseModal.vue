<template>
<NModal
	:show="show"
	preset="card"
	title="Interactive rebase"
	style="width: 660px;"
	:mask-closable="false"
	@update:show="onUpdateShow"
>
	<div class="rebase">
		<div class="rebase__intro">
			Rebasing <strong>{{ source }}</strong> onto <strong>{{ target }}</strong>
			<span class="rebase__hint">— top row is applied first</span>
		</div>

		<div class="rebase__list">
			<div
				v-for="(step, index) in steps"
				:key="step.hash"
				class="rebase__row"
				:class="{'rebase__row--drop': step.action === 'drop', 'rebase__row--drag': dragIndex === index}"
				draggable="true"
				@dragstart="onDragStart(index)"
				@dragover.prevent="onDragOver(index)"
				@drop.prevent="onDrop(index)"
				@dragend="dragIndex = null"
			>
				<Icon name="mdi-drag" class="rebase__handle" />

				<div class="rebase__actions">
					<button
						v-for="action in actionOptions"
						:key="action.value"
						class="rebase__action"
						:class="[`rebase__action--${action.value}`, {'rebase__action--on': step.action === action.value}]"
						:disabled="isActionDisabled(action.value, index)"
						:title="action.title"
						@click="setAction(step, action.value)"
					>
						{{ action.label }}
					</button>
				</div>

				<span class="rebase__hash">{{ step.shortHash }}</span>

				<NInput
					v-if="step.action === 'reword'"
					v-model:value="step.message"
					size="tiny"
					class="rebase__message"
					placeholder="New commit message"
				/>
				<span v-else class="rebase__subject">{{ step.subject }}</span>

				<div class="rebase__move">
					<button class="rebase__move-btn" :disabled="index === 0" title="Move up" @click="move(index, -1)">
						<Icon name="mdi-chevron-up" />
					</button>
					<button class="rebase__move-btn" :disabled="index === steps.length - 1" title="Move down" @click="move(index, 1)">
						<Icon name="mdi-chevron-down" />
					</button>
				</div>
			</div>
		</div>
	</div>

	<template #footer>
		<div class="rebase__footer">
			<span class="rebase__summary">{{ keptCount }} of {{ steps.length }} commits kept</span>
			<NButton test-id="rebase-cancel-btn" :disabled="running" @click="close">Cancel</NButton>
			<NButton
				test-id="rebase-start-btn"
				type="primary"
				:loading="running"
				:disabled="running || keptCount === 0"
				@click="execute"
			>
				Start rebase
			</NButton>
		</div>
	</template>
</NModal>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {NModal, NInput, NButton} from 'naive-ui';
import Icon from '@/ui/components/Icon.vue';
import {useRebase} from '@/composables/useRebase';
import type {TRebaseAction, IRebaseStep} from '@/composables/useRebase';

const {show, source, target, steps, running, close, move, reorder, execute} = useRebase();

const actionOptions: Array<{value: TRebaseAction; label: string; title: string}> = [
	{value: 'pick', label: 'Pick', title: 'Keep the commit as-is'},
	{value: 'reword', label: 'Reword', title: 'Keep the commit, edit its message'},
	{value: 'squash', label: 'Squash', title: 'Meld into the previous commit, combine messages'},
	{value: 'fixup', label: 'Fixup', title: 'Meld into the previous commit, discard this message'},
	{value: 'drop', label: 'Drop', title: 'Remove the commit'},
];

const dragIndex = ref<number | null>(null);

const keptCount = computed(() => steps.value.filter(s => s.action !== 'drop').length);

// Index of the first non-dropped step — it can't meld into a predecessor.
const firstKeptIndex = computed(() => steps.value.findIndex(s => s.action !== 'drop'));

function isActionDisabled(action: TRebaseAction, index: number): boolean {
	return (action === 'squash' || action === 'fixup') && index === firstKeptIndex.value;
}

function setAction(step: IRebaseStep, action: TRebaseAction): void {
	step.action = action;
}

function onDragStart(index: number): void {
	dragIndex.value = index;
}

function onDragOver(index: number): void {
	if (dragIndex.value === null || dragIndex.value === index) return;

	reorder(dragIndex.value, index);
	dragIndex.value = index;
}

function onDrop(index: number): void {
	if (dragIndex.value !== null) reorder(dragIndex.value, index);
	dragIndex.value = null;
}

function onUpdateShow(value: boolean): void {
	if (!value) close();
}
</script>

<style scoped lang="scss">
.rebase {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.rebase__intro {
	font-size: 12.5px;
	color: $text-secondary;

	strong {
		color: $text-primary;
	}
}

.rebase__hint {
	color: $text-faint;
	margin-left: 4px;
}

.rebase__list {
	display: flex;
	flex-direction: column;
	gap: 3px;
	max-height: 420px;
	overflow-y: auto;
}

.rebase__row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 6px;
	border: 1px solid $border;
	border-radius: 5px;
	background-color: $bg-section;

	&--drop {
		opacity: 0.5;

		.rebase__subject {
			text-decoration: line-through;
		}
	}

	&--drag {
		border-color: $color-accent;
	}
}

.rebase__handle {
	width: 15px;
	height: 15px;
	color: $text-faint;
	cursor: grab;
	flex-shrink: 0;
}

.rebase__actions {
	display: flex;
	gap: 2px;
	flex-shrink: 0;
}

.rebase__action {
	padding: 2px 6px;
	font-size: 10.5px;
	font-weight: 600;
	border: 1px solid $border-strong;
	border-radius: 3px;
	background: transparent;
	color: $text-muted;
	cursor: pointer;

	&:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	&--on {
		color: $text-white;
	}

	&--pick.rebase__action--on { background: rgba($color-success, 0.25); border-color: $color-success; }
	&--reword.rebase__action--on { background: rgba($color-accent, 0.25); border-color: $color-accent; }
	&--squash.rebase__action--on { background: rgba($project-purple, 0.25); border-color: $project-purple; }
	&--fixup.rebase__action--on { background: rgba($color-cyan, 0.25); border-color: $color-cyan; }
	&--drop.rebase__action--on { background: rgba($color-danger, 0.25); border-color: $color-danger; }
}

.rebase__hash {
	font-family: monospace;
	font-size: 11px;
	color: $text-faint;
	flex-shrink: 0;
}

.rebase__subject {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 12px;
	color: $text-default;
}

.rebase__message {
	flex: 1;
}

.rebase__move {
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
}

.rebase__move-btn {
	display: flex;
	padding: 0;
	border: none;
	background: transparent;
	color: $text-muted;
	cursor: pointer;

	svg {
		width: 13px;
		height: 13px;
	}

	&:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	&:hover:not(:disabled) {
		color: $text-white;
	}
}

.rebase__footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
}

.rebase__summary {
	margin-right: auto;
	font-size: 11.5px;
	color: $text-faint;
}
</style>
