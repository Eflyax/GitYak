<template>
	<Transition name="background-tasks">
		<div
			v-if="current"
			test-id="background-tasks-indicator"
			class="background-tasks"
			:title="tasks.map(t => t.label).join('\n')"
		>
			<Icon
				name="mdi-loading"
				class="background-tasks__spinner"
			/>
			<span class="background-tasks__label">{{ current.label }}…</span>
			<span
				v-if="tasks.length > 1"
				class="background-tasks__more"
			>
				+{{ tasks.length - 1 }}
			</span>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {useBackgroundTasks} from '@/composables/useBackgroundTasks';
import Icon from '@/ui/components/Icon.vue';

const {tasks} = useBackgroundTasks();

// The oldest task leads: it is the one the user has been waiting on the longest.
const current = computed(() => tasks.value[0]);
</script>

<style scoped lang="scss">
// Sits in the bottom-left corner where the notifications appear; App.vue lifts the
// notification stack above it while it is shown, so the two never overlap.
.background-tasks {
	align-items: center;
	background-color: $bg-panel;
	background-color: color-mix(in srgb, #{$color-accent} 14%, #{$bg-panel});
	border-left: 3px solid $color-accent;
	border-radius: 4px;
	bottom: 12px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
	color: $text-primary;
	display: flex;
	font-size: 12.5px;
	gap: 8px;
	height: 36px;
	left: 16px;
	padding: 0 14px 0 10px;
	position: fixed;
	z-index: 4000;

	&__spinner {
		animation: background-tasks-spin 0.9s linear infinite;
		color: $color-accent;
		height: 16px;
		width: 16px;
	}

	&__label {
		font-weight: 500;
		white-space: nowrap;
	}

	&__more {
		background: color-mix(in srgb, #{$text-white} 10%, transparent);
		border-radius: 8px;
		color: $text-muted;
		font-size: 11px;
		padding: 1px 6px;
	}
}

.background-tasks-enter-active,
.background-tasks-leave-active {
	transition: opacity 0.2s, transform 0.2s;
}

.background-tasks-enter-from,
.background-tasks-leave-to {
	opacity: 0;
	transform: translateY(8px);
}

@keyframes background-tasks-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>
