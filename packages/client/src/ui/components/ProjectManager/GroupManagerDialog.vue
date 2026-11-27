<template>
	<n-modal
		:show="show"
		preset="card"
		title="Groups"
		test-id="group-manager-dialog"
		style="width: 440px;"
		@update:show="emit('update:show', $event)"
	>
		<div class="group-manager">
			<div class="group-list">
				<div
					v-for="group in groups"
					:key="group.id"
					class="group-item"
				>
					<span
						class="group-dot"
						:style="{background: group.color ?? GROUP_COLORS[0]}"
					/>
					<span class="group-item-name">{{ group.name }}</span>

					<div class="group-actions">
						<n-button
							test-id="edit-group-btn"
							size="small"
							quaternary
							title="Edit"
							@click="openEditGroup(group)"
						>
							<template #icon>
								<Icon name="mdi-pencil" />
							</template>
						</n-button>
						<n-button
							test-id="delete-group-btn"
							size="small"
							quaternary
							type="error"
							title="Delete"
							@click="confirmDeleteGroup(group)"
						>
							<template #icon>
								<Icon name="mdi-trash-can-outline" />
							</template>
						</n-button>
					</div>
				</div>

				<div
					v-if="!groups.length"
					class="empty"
				>
					No groups yet
				</div>
			</div>

			<n-button
				test-id="add-group-btn"
				type="primary"
				@click="openAddGroup"
			>
				<template #icon>
					<Icon name="mdi-plus" />
				</template>
				Add Group
			</n-button>
		</div>
	</n-modal>

	<n-modal
		v-model:show="showGroupForm"
		:mask-closable="false"
		preset="card"
		:title="editableGroup?.id ? 'Edit Group' : 'Add Group'"
		style="width: 400px;"
	>
		<n-form
			v-if="editableGroup"
			label-placement="left"
			label-width="80"
		>
			<n-form-item label="Name">
				<n-input
					v-model:value="editableGroup.name"
					test-id="group-name-input"
					placeholder="Group name"
				/>
			</n-form-item>
			<n-form-item label="Color">
				<div class="color-picker">
					<button
						v-for="color in GROUP_COLORS"
						:key="color"
						type="button"
						class="color-dot"
						:class="{'color-dot--active': editableGroup.color === color}"
						:style="{background: color}"
						@click="editableGroup!.color = color"
					/>
				</div>
			</n-form-item>
		</n-form>
		<template #footer>
			<div class="form-actions">
				<n-button
					test-id="group-form-cancel-btn"
					@click="showGroupForm = false"
				>
					Cancel
				</n-button>
				<n-button
					test-id="group-form-save-btn"
					type="primary"
					:disabled="!editableGroup?.name"
					@click="handleSaveGroup"
				>
					{{ editableGroup?.id ? 'Save' : 'Add Group' }}
				</n-button>
			</div>
		</template>
	</n-modal>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import {NButton, NForm, NFormItem, NInput, NModal, useDialog} from 'naive-ui';
import {useProject} from '@/composables/useProject';
import type {IProjectGroup} from '@/domain';
import Icon from '@/ui/components/Icon.vue';

const GROUP_COLORS = [
	'#6f9ef8',
	'#f87171',
	'#4ade80',
	'#fb923c',
	'#a78bfa',
	'#34d399',
	'#fbbf24',
	'#f472b6',
] as const;

defineProps<{
	show: boolean;
}>();

const emit = defineEmits<{
	'update:show': [value: boolean];
}>();

const dialog = useDialog();
const {groups, addGroup, updateGroup, removeGroup} = useProject();

const showGroupForm = ref(false);
const editableGroup = ref<Partial<IProjectGroup> & {name: string} | null>(null);

function openAddGroup(): void {
	editableGroup.value = {name: '', color: GROUP_COLORS[0]};
	showGroupForm.value = true;
}

function openEditGroup(group: IProjectGroup): void {
	editableGroup.value = {...group};
	showGroupForm.value = true;
}

function handleSaveGroup(): void {
	if (!editableGroup.value?.name) return;

	if (editableGroup.value.id) {
		updateGroup(editableGroup.value.id, {
			name: editableGroup.value.name,
			color: editableGroup.value.color,
		});
	}
	else {
		addGroup({
			name: editableGroup.value.name,
			color: editableGroup.value.color,
		});
	}

	showGroupForm.value = false;
}

function confirmDeleteGroup(group: IProjectGroup): void {
	dialog.warning({
		title: 'Delete Group',
		content: `Delete group "${group.name}"? Projects in this group will become ungrouped.`,
		positiveText: 'Delete',
		negativeText: 'Cancel',
		onPositiveClick: () => removeGroup(group.id),
	});
}
</script>

<style scoped lang="scss">
.group-manager {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.group-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 360px;
	overflow-y: auto;
}

.group-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	border-radius: 6px;
	background: $bg-section;
}

.group-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.group-item-name {
	flex: 1;
	min-width: 0;
	font-size: 0.9em;
	color: $text-primary;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.group-actions {
	display: flex;
	gap: 2px;
}

.empty {
	padding: 16px;
	text-align: center;
	color: $text-dim;
	font-size: 0.9em;
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.color-picker {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.color-dot {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 2px solid transparent;
	cursor: pointer;
	transition: transform 0.15s, border-color 0.15s;

	&:hover { transform: scale(1.2); }
	&--active { border-color: $text-white; transform: scale(1.15); }
}
</style>
