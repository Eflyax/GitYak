<template>
	<div class="repo-actions">
		<button
			v-for="action in REPO_ACTIONS"
			:key="action.kind"
			type="button"
			:test-id="`repo-action-${action.kind}`"
			class="repo-action"
			:class="{'repo-action--active': active === action.kind}"
			@click="emit('select', action.kind)"
		>
			<Icon
				:name="action.icon"
				class="repo-action__icon"
			/>
			<span class="repo-action__label">{{ action.label }}</span>
			<span class="repo-action__hint">{{ action.hint }}</span>
		</button>
	</div>
</template>

<script setup lang="ts">
import Icon from '@/ui/components/Icon.vue';
import {REPO_ACTIONS} from './managerPanel';
import type {TRepoActionKind} from './managerPanel';

defineProps<{
	/** The action whose form is showing, if any. */
	active: string;
}>();

const emit = defineEmits<{
	select: [kind: TRepoActionKind];
}>();
</script>

<style scoped lang="scss">
.repo-actions {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 10px;
}

.repo-action {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 14px 10px;
	border: 1px solid $border-strong;
	border-radius: 8px;
	background: $bg-section;
	color: $text-primary;
	font: inherit;
	text-align: center;
	cursor: pointer;
	transition: background-color 0.15s, border-color 0.15s;

	&:hover {
		background: $bg-button-hover;
	}

	&:focus-visible {
		outline: 1px solid $color-accent;
		outline-offset: 1px;
	}

	&--active {
		border-color: $color-accent;
	}

	&__icon {
		width: 22px;
		height: 22px;
		fill: $color-accent;
	}

	&__label {
		font-size: 14px;
		font-weight: 600;
	}

	&__hint {
		font-size: 11px;
		color: $text-dim;
		line-height: 1.3;
	}
}
</style>
