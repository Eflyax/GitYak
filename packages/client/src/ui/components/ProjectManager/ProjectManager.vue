<template>
	<div class="project-manager">
		<!-- Tabs: Projects / Groups -->
		<n-tabs v-model:value="activeTab" type="line" animated>

			<!-- ── Projects tab ─────────────────────────── -->
			<n-tab-pane name="projects" tab="Projects">
				<div class="tab-content">
					<div class="toolbar">
						<n-input
							test-id="search-projects-input"
							v-model:value="filterText"
							placeholder="Search projects…"
							clearable
						>
							<template #prefix>
								<Icon name="mdi-magnify" />
							</template>
						</n-input>
						<n-button test-id="add-project-btn" type="primary" @click="openAdd">
							<template #icon><Icon name="mdi-plus" /></template>
							Add Project
						</n-button>
					</div>

					<n-select
						test-id="group-filter-select"
						v-model:value="selectedGroupFilter"
						:options="groupFilterOptions"
						clearable
						placeholder="All groups"
					/>

					<div class="project-list">
						<!-- Grouped projects -->
						<template v-for="group in groups" :key="group.id">
							<div
								v-if="projectsByGroup[group.id]?.length"
								class="group-section"
							>
								<div class="group-header">
									<span
										class="group-dot"
										:style="{background: group.color ?? '#888'}"
									/>
									<span class="group-name">{{ group.name }}</span>
								</div>

								<ProjectRow
									v-for="project in projectsByGroup[group.id]"
									:key="project.id"
									:project="project"
									@open="handleOpenProject(project)"
									@edit="openEdit(project)"
									@duplicate="openDuplicate(project)"
									@delete="confirmDelete(project)"
								/>
							</div>
						</template>

						<!-- Ungrouped projects -->
						<div v-if="ungrouped.length" class="group-section">
							<div v-if="groups.length" class="group-header">
								<span class="group-name group-name--dim">Ungrouped</span>
							</div>

							<ProjectRow
								v-for="project in ungrouped"
								:key="project.id"
								:project="project"
								@open="handleOpenProject(project)"
								@edit="openEdit(project)"
								@duplicate="openDuplicate(project)"
								@delete="confirmDelete(project)"
							/>
						</div>

						<div v-if="filteredProjects.length === 0" class="empty">
							No projects found
						</div>
					</div>
				</div>
			</n-tab-pane>

			<!-- ── Groups tab ─────────────────────────────── -->
			<n-tab-pane name="groups" tab="Groups">
				<div class="tab-content">
					<div class="toolbar">
						<n-button test-id="add-group-btn" type="primary" @click="openAddGroup">
							<template #icon><Icon name="mdi-plus" /></template>
							Add Group
						</n-button>
					</div>

					<div class="group-list">
						<div
							v-for="group in groups"
							:key="group.id"
							class="group-item"
						>
							<span
								class="group-dot"
								:style="{background: group.color ?? '#888'}"
							/>
							<span class="group-item-name">{{ group.name }}</span>

							<div class="group-actions">
								<n-button
									test-id="edit-group-btn"
									size="small"
									type="info"
									@click="openEditGroup(group)"
								>
									<template #icon><Icon name="mdi-pencil" /></template>
								</n-button>
								<n-button
									test-id="delete-group-btn"
									size="small"
									type="error"
									@click="confirmDeleteGroup(group)"
								>
									<template #icon><Icon name="mdi-trash-can" /></template>
								</n-button>
							</div>
						</div>

						<div v-if="!groups.length" class="empty">
							No groups yet
						</div>
					</div>
				</div>
			</n-tab-pane>
		</n-tabs>

		<!-- ── Project form modal ─────────────────────── -->
		<n-modal
			v-model:show="showProjectForm"
			:mask-closable="false"
			preset="card"
			style="width: 620px;"
		>
			<ProjectForm
				:project="editableProject"
				@saved="onProjectSaved"
				@cancel="showProjectForm = false"
			/>
		</n-modal>

		<!-- ── Group form modal ───────────────────────── -->
		<n-modal
			v-model:show="showGroupForm"
			:mask-closable="false"
			preset="card"
			:title="editableGroup?.id ? 'Edit Group' : 'Add Group'"
			style="width: 400px;"
		>
			<n-form v-if="editableGroup" label-placement="left" label-width="80">
				<n-form-item label="Name">
					<n-input v-model:value="editableGroup.name" placeholder="Group name" />
				</n-form-item>
				<n-form-item label="Color">
					<div class="color-picker">
						<button
							v-for="color in GROUP_COLORS"
							:key="color"
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
					<n-button test-id="group-form-cancel-btn" @click="showGroupForm = false">Cancel</n-button>
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
	</div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {
	NTabs,
	NTabPane,
	NInput,
	NButton,
	NModal,
	NForm,
	NFormItem,
	NSelect,
	useDialog,
} from 'naive-ui';
import {useProject} from '@/composables/useProject';
import type {IProject, IProjectGroup} from '@/domain';
import Icon from '@/ui/components/Icon.vue';
import ProjectForm from './ProjectForm.vue';

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

import ProjectRow from './ProjectRow.vue';

const emit = defineEmits<{
	'project-opened': []
}>();

const dialog = useDialog();
const {projects, groups, openProject, removeProject, addGroup, updateGroup, removeGroup, selectedGroupFilter} = useProject();

const activeTab = ref<'projects' | 'groups'>('projects');
const filterText = ref('');
const showProjectForm = ref(false);
const editableProject = ref<IProject | null>(null);
const showGroupForm = ref(false);
const editableGroup = ref<Partial<IProjectGroup> & {name: string} | null>(null);

const groupFilterOptions = computed(() => [
	...groups.value.map(g => ({
		label: g.name,
		value: g.id,
	})),
	{label: 'Ungrouped', value: '__ungrouped__'},
]);

const filteredProjects = computed(() => {
	const q = filterText.value.toLowerCase();
	const groupFilter = selectedGroupFilter.value;

	return projects.value.filter(p => {
		if (q && !p.alias.toLowerCase().includes(q) && !p.path.toLowerCase().includes(q)) {
			return false;
		}
		if (groupFilter === '__ungrouped__') {
			return !p.groupId;
		}
		if (groupFilter !== null) {
			return p.groupId === groupFilter;
		}
		return true;
	});
});

const projectsByGroup = computed(() => {
	const map: Record<string, IProject[]> = {};
	for (const p of filteredProjects.value) {
		if (p.groupId) {
			if (!map[p.groupId]) map[p.groupId] = [];
			map[p.groupId]!.push(p);
		}
	}
	return map;
});

const ungrouped = computed(() =>
	filteredProjects.value.filter(p => !p.groupId),
);

// ── Project actions ──────────────────────────────────────────────────────────

function handleOpenProject(project: IProject): void {
	openProject(project);
	emit('project-opened');
}

function openAdd(): void {
	editableProject.value = null;
	showProjectForm.value = true;
}

function openEdit(project: IProject): void {
	editableProject.value = {...project};
	showProjectForm.value = true;
}

function openDuplicate(project: IProject): void {
	editableProject.value = {
		...project,
		id: '',
		alias: project.alias + ' (copy)',
	};
	showProjectForm.value = true;
}

function onProjectSaved(): void {
	showProjectForm.value = false;
}

function confirmDelete(project: IProject): void {
	dialog.warning({
		title: 'Delete Project',
		content: `Remove "${project.alias}" from the list? The repository will not be deleted from disk.`,
		positiveText: 'Remove',
		negativeText: 'Cancel',
		onPositiveClick: () => removeProject(project.id),
	});
}

// ── Group actions ────────────────────────────────────────────────────────────

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
.project-manager {
	width: 680px;
	min-height: 480px;
}

.tab-content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-top: 12px;
}

.toolbar {
	display: flex;
	align-items: center;
	gap: 8px;
}

/* ── Projects ─────────────────────────────────── */

.project-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-height: 400px;
	overflow-y: auto;
}

.group-section {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.group-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 4px 2px;
}

.group-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.group-name {
	font-size: 0.78em;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: #aaa;

	&--dim { color: #555; }
}

.project-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 10px;
	border-radius: 6px;
	background: $bg-section;
	border: 1px solid transparent;
	transition: border-color 0.15s;

	&:hover { border-color: $border-strong; }
}

.project-info {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.project-color-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.project-alias {
	font-weight: 500;
	font-size: 0.9em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.project-path {
	font-size: 0.78em;
	color: #666;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 340px;
}

/* ── Groups ────────────────────────────────────── */

.group-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.group-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px;
	border-radius: 6px;
	background: $bg-section;
}

.group-item-name {
	flex: 1;
	font-size: 0.9em;
}

.group-actions {
	display: flex;
	gap: 6px;
}

/* ── Shared ─────────────────────────────────────── */

.empty {
	padding: 24px;
	text-align: center;
	color: #555;
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
