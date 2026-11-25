<template>
	<div
		v-if="session"
		class="theme-editor-bar"
		test-id="theme-editor-bar"
	>
		<div class="theme-editor-bar__name">
			<span
				class="theme-editor-bar__title"
				:title="session.name"
			>{{ session.name }}</span>
			<span class="theme-editor-bar__subtitle">
				{{ session.mode === 'copy' ? 'New theme' : 'Editing theme' }}
			</span>
		</div>

		<div class="theme-editor-bar__groups">
			<div
				v-for="group in groups"
				:key="group.name"
				class="theme-editor-bar__group"
			>
				<span class="theme-editor-bar__group-label">{{ group.name }}</span>
				<div class="theme-editor-bar__swatches">
					<NColorPicker
						v-for="color in group.colors"
						:key="color.token"
						:value="colors[color.token]"
						:modes="['hex']"
						:show-alpha="false"
						placement="top-start"
						@update:value="setColor(color.token, $event)"
					>
						<template #trigger="{onClick, ref: setTriggerRef}">
							<button
								:ref="setTriggerRef"
								type="button"
								class="theme-editor-bar__swatch"
								:test-id="`theme-color-${color.token}`"
								:style="{backgroundColor: colors[color.token]}"
								:title="`${color.label}: ${colors[color.token]}`"
								@click="onClick"
							/>
						</template>
					</NColorPicker>
				</div>
			</div>
		</div>

		<div class="theme-editor-bar__actions">
			<NButton
				test-id="theme-editor-cancel-btn"
				size="small"
				:disabled="isSaving"
				@click="handleCancel"
			>
				Cancel
			</NButton>
			<NButton
				test-id="theme-editor-save-btn"
				size="small"
				type="primary"
				:loading="isSaving"
				@click="handleSave"
			>
				Save
			</NButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import {NButton, NColorPicker} from 'naive-ui';
import {EDITABLE_THEME_COLORS} from '@/domain/services/themeEditor';
import type {IEditableThemeColor, TThemeColorGroup} from '@/domain/services/themeEditor';
import {useThemeEditor} from '@/composables/useThemeEditor';
import {useNotify} from '@/composables/useNotify';

const {session, colors, isSaving, setColor, cancel, save} = useThemeEditor();
const notify = useNotify();

const groups = EDITABLE_THEME_COLORS.reduce<Array<{name: TThemeColorGroup; colors: IEditableThemeColor[]}>>(
	(result, color) => {
		const group = result.find(g => g.name === color.group);

		if (group) {
			group.colors.push(color);
		}
		else {
			result.push({name: color.group, colors: [color]});
		}

		return result;
	},
	[],
);

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

async function handleSave(): Promise<void> {
	const name = session.value?.name;

	try {
		await save();
		notify.success(`Theme "${name}" saved`);
	}
	catch (err: unknown) {
		notify.error(errorMessage(err));
	}
}

async function handleCancel(): Promise<void> {
	try {
		await cancel();
	}
	catch (err: unknown) {
		notify.error(errorMessage(err));
	}
}
</script>

<style scoped lang="scss">
.theme-editor-bar {
	display: flex;
	align-items: center;
	gap: 20px;
	flex-shrink: 0;
	padding: 8px 14px;
	background-color: $bg-toolbar;
	border-top: 2px solid $color-accent;

	&__name {
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-width: 220px;
	}

	&__title {
		overflow: hidden;
		color: $text-primary;
		font-size: 13px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__subtitle {
		color: $text-muted;
		font-size: 11px;
	}

	&__groups {
		display: flex;
		flex: 1;
		align-items: flex-end;
		gap: 18px;
		min-width: 0;
		overflow-x: auto;
	}

	&__group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	&__group-label {
		color: $text-muted;
		font-size: 10px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	&__swatches {
		display: flex;
		gap: 6px;
	}

	&__swatch {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid $border-strong;
		border-radius: 4px;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px rgba(white, 0.08);

		&:hover,
		&:focus-visible {
			outline: 2px solid $color-accent;
			outline-offset: 1px;
		}
	}

	&__actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}
}
</style>
