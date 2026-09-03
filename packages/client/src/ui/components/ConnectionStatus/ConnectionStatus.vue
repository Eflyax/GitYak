<template>
	<div class="connection-status-wrapper">
		<div class="connection-status">
			<div class="connection-status__header">
				<span class="connection-status__title">
					{{ phase === 'error' ? 'Connection error' : 'Connecting…' }}
				</span>
				<span class="connection-status__target">{{ connectingTo }}</span>
			</div>

			<div class="connection-status__steps">
				<div
					v-for="step in steps"
					:key="step.key"
					class="connection-status__step"
					:class="`connection-status__step--${stepState(step.key)}`"
				>
					<span class="connection-status__step-icon">
						<Icon
							v-if="stepState(step.key) === 'done'"
							name="mdi-check-circle"
							class="icon-done"
						/>
						<Icon
							v-else-if="stepState(step.key) === 'active'"
							name="mdi-loading"
							class="icon-active icon-spin"
						/>
						<Icon
							v-else-if="stepState(step.key) === 'error'"
							name="mdi-close-circle"
							class="icon-error"
						/>
						<Icon
							v-else
							name="mdi-circle-outline"
							class="icon-pending"
						/>
					</span>
					<span class="connection-status__step-label">{{ step.label }}</span>
				</div>
			</div>

			<div
				v-if="phase === 'uploading'"
				class="connection-status__progress"
			>
				<NProgress
					type="line"
					:percentage="uploadProgress"
					indicator-placement="inside"
					:processing="uploadProgress < 100"
					:height="20"
					:border-radius="4"
					:fill-border-radius="4"
					rail-color="#1e2228"
					color="#3b82f6"
				/>
				<span class="connection-status__progress-label">
					{{ formatBytes(Math.round(uploadTotal * uploadProgress / 100)) }} / {{ formatBytes(uploadTotal) }}
				</span>
			</div>

			<div
				v-if="phase === 'error'"
				class="connection-status__error"
			>
				<Icon
					name="mdi-alert-circle"
					class="icon-error"
				/>
				<span>{{ errorMessage }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {NProgress} from 'naive-ui';
import Icon from '../Icon.vue';
import {useConnectionStatus} from '@/composables/useConnectionStatus';
import type {ConnectionPhase} from '@/composables/useConnectionStatus';

const {phase, uploadProgress, uploadTotal, errorMessage, connectingTo} = useConnectionStatus();

interface IStep {
	key: Exclude<ConnectionPhase, 'idle' | 'error'>;
	label: string;
}

const steps: IStep[] = [
	{key: 'connecting', label: 'SSH handshake'},
	{key: 'checking', label: 'Checking remote worker'},
	{key: 'uploading', label: 'Uploading remote worker'},
	{key: 'starting', label: 'Starting remote worker'},
	{key: 'tunneling', label: 'Creating SSH tunnel'},
];

const phaseOrder: ConnectionPhase[] = ['connecting', 'checking', 'uploading', 'starting', 'tunneling'];

const currentPhaseIndex = computed(() => phaseOrder.indexOf(phase.value as Exclude<ConnectionPhase, 'idle' | 'error'>));

type StepState = 'done' | 'active' | 'pending' | 'error';

function stepState(key: IStep['key']): StepState {
	const stepIndex = phaseOrder.indexOf(key);
	const curr = currentPhaseIndex.value;

	if (phase.value === 'error') {
		if (stepIndex < curr) return 'done';
		if (stepIndex === curr) return 'error';
		return 'pending';
	}

	if (stepIndex < curr) return 'done';
	if (stepIndex === curr) return 'active';
	return 'pending';
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const mb = bytes / (1024 * 1024);
	if (mb >= 1) return `${mb.toFixed(1)} MB`;
	const kb = bytes / 1024;
	return `${kb.toFixed(0)} KB`;
}
</script>

<style scoped lang="scss">
.connection-status-wrapper {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
}

.connection-status {
	background-color: $bg-panel;
	border: 1px solid $border;
	border-radius: 12px;
	padding: 28px 32px;
	width: 320px;
	display: flex;
	flex-direction: column;
	gap: 20px;

	&__header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	&__title {
		font-size: 18px;
		font-weight: 600;
		color: $text-primary;
	}

	&__target {
		font-size: 13px;
		color: $text-dim;
		font-family: monospace;
	}

	&__steps {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	&__step {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;

		&--done .connection-status__step-label {
			color: $text-muted;
		}

		&--active .connection-status__step-label {
			color: $text-primary;
			font-weight: 500;
		}

		&--pending .connection-status__step-label {
			color: $text-faint;
		}

		&--error .connection-status__step-label {
			color: $color-danger;
		}
	}

	&__step-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	&__progress {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	&__progress-label {
		font-size: 12px;
		color: $text-dim;
		text-align: right;
	}

	&__error {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		background-color: rgba($color-danger, 0.08);
		border: 1px solid rgba($color-danger, 0.2);
		border-radius: 8px;
		padding: 12px;
		font-size: 13px;
		color: $color-danger;
		line-height: 1.5;
	}
}

.icon-done {
	color: $color-success;
	width: 18px;
	height: 18px;
}

.icon-active {
	color: $text-primary;
	width: 18px;
	height: 18px;
}

.icon-pending {
	color: $text-faint;
	width: 18px;
	height: 18px;
}

.icon-error {
	color: $color-danger;
	width: 18px;
	height: 18px;
	flex-shrink: 0;
}

.icon-spin {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>
