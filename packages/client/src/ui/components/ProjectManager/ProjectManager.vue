<template>
	<div
		test-id="project-manager"
		class="project-manager"
		:class="{'project-manager--opening': opening}"
		:aria-busy="opening"
	>
		<section class="project-manager__left">
			<header class="project-manager__header">
				<h1 class="project-manager__title">
					Projects
				</h1>
				<n-button
					v-if="currentProject"
					test-id="close-project-manager-btn"
					size="small"
					secondary
					:title="`Back to ${currentProject.alias} (Esc)`"
					@click="close"
				>
					<template #icon>
						<Icon name="mdi-arrow-left" />
					</template>
					Back to {{ currentProject.alias }}
				</n-button>
			</header>

			<RepoActionCards
				:active="panel.kind"
				@select="setPanel({kind: $event})"
			/>

			<div class="project-manager__lists">
				<section
					v-if="recent.length"
					test-id="recent-projects"
					class="project-manager__section"
				>
					<div class="project-manager__heading">
						<span>Recent</span>
					</div>
					<ProjectRow
						v-for="project in recent"
						:key="project.id"
						:project="project"
						:selected="project.id === selectedId"
						@select="select"
						@open="open"
					/>
				</section>

				<section
					test-id="all-projects"
					class="project-manager__section"
				>
					<div class="project-manager__heading">
						<span>All projects</span>
						<n-button
							test-id="manage-groups-btn"
							size="tiny"
							quaternary
							@click="showGroups = true"
						>
							<template #icon>
								<Icon name="mdi-folder-multiple-outline" />
							</template>
							Groups
						</n-button>
					</div>
					<n-input
						v-model:value="filterText"
						test-id="search-projects-input"
						class="project-manager__search"
						placeholder="Search projects…"
						size="small"
						clearable
					>
						<template #prefix>
							<Icon name="mdi-magnify" />
						</template>
					</n-input>
					<ProjectList
						:projects="filteredProjects"
						:groups="groups"
						:selected-id="selectedId"
						:empty-text="projects.length ? 'No projects match the search' : 'No projects yet'"
						@select="select"
						@open="open"
					/>
				</section>
			</div>
		</section>

		<section class="project-manager__right">
			<ProjectForm
				v-if="panel.kind === 'project' && selectedProject"
				:key="`project:${selectedProject.id}`"
				:project="selectedProject"
				:opening="opening"
				@saved="select"
				@duplicate="panel = {kind: 'duplicate', source: $event}"
				@open="open"
				@removed="panel = {kind: 'empty'}"
			/>

			<ProjectForm
				v-else-if="panel.kind === 'duplicate'"
				:key="`duplicate:${panel.source.id}`"
				:project="null"
				:duplicate-of="panel.source"
				@saved="select"
			/>

			<RepoActionForm
				v-else-if="actionKind"
				:key="`action:${actionKind}`"
				:mode="actionKind"
				@done="select"
				@cancel="panel = {kind: 'empty'}"
			/>

			<div
				v-else
				test-id="project-manager-empty"
				class="project-manager__placeholder"
			>
				<Icon
					name="mdi-source-repository"
					class="project-manager__placeholder-icon"
				/>
				<p>Select a project, or start with Open, Clone or Create.</p>
			</div>
		</section>

		<GroupManagerDialog v-model:show="showGroups" />
	</div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
import {NButton, NInput} from 'naive-ui';
import {useProject} from '@/composables/useProject';
import {useProjectManager} from '@/composables/useProjectManager';
import {useCommands} from '@/composables/useCommands';
import {useProjectSettings} from '@/composables/useProjectSettings';
import {connectionLabel, recentProjects} from '@/domain/services/projectManager';
import type {IProject} from '@/domain';
import Icon from '@/ui/components/Icon.vue';
import GroupManagerDialog from './GroupManagerDialog.vue';
import ProjectForm from './ProjectForm.vue';
import ProjectList from './ProjectList.vue';
import ProjectRow from './ProjectRow.vue';
import RepoActionCards from './RepoActionCards.vue';
import RepoActionForm from './RepoActionForm.vue';
import type {TManagerPanel, TRepoActionKind} from './managerPanel';

const {projects, groups, currentProject} = useProject();
const {opening, openFromManager, leaveManager, confirmLeave} = useProjectManager();
const {paletteOpen} = useCommands();
const {recentCount} = useProjectSettings();

const panel = ref<TManagerPanel>({kind: 'empty'});
const filterText = ref('');
const showGroups = ref(false);

const recent = computed(() => recentProjects(projects.value, recentCount.value));

const filteredProjects = computed(() => {
	const q = filterText.value.trim().toLowerCase();

	if (!q) return projects.value;

	return projects.value.filter(p => p.alias.toLowerCase().includes(q)
		|| p.path.toLowerCase().includes(q)
		|| connectionLabel(p).toLowerCase().includes(q));
});

const selectedId = computed(() => panel.value.kind === 'project' ? panel.value.id : null);

const selectedProject = computed(() => {
	const id = selectedId.value;

	return id ? projects.value.find(p => p.id === id) ?? null : null;
});

const actionKind = computed<TRepoActionKind | null>(() => {
	const kind = panel.value.kind;

	return kind === 'open' || kind === 'clone' || kind === 'create' ? kind : null;
});

// A clone running in the action form asks before its panel is replaced (see `confirmLeave`);
// choosing the action already shown keeps that form as it is.
async function setPanel(next: TManagerPanel): Promise<void> {
	if (next.kind !== actionKind.value && !await confirmLeave()) return;

	panel.value = next;
}

function select(project: IProject): void {
	void setPanel({kind: 'project', id: project.id});
}

// One open at a time: a second double-click while the first project is still connecting is
// ignored rather than starting a second connect.
function open(project: IProject): void {
	void openFromManager(project);
}

// Back to the open project. After a failed open of another one, that project is still
// connected - the failed connect never replaced it - so its error is cleared, not shown again.
function close(): void {
	void leaveManager();
}

function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;

	if (!el || typeof el.tagName !== 'string') return false;

	return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

// Esc goes back to the open project - unless it belongs to a dialog, the palette or a field
// above the manager, which handle it themselves.
function onKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || !currentProject.value || paletteOpen.value) return;
	// Naive UI keeps a modal's container after it closes; its body is there only while open.
	if (isTypingTarget(event.target) || document.querySelector('.n-modal-container .n-modal')) return;

	close();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped lang="scss">
.project-manager {
	display: flex;
	flex: 1;
	min-height: 0;
	background: $bg-app;

	&--opening {
		cursor: progress;
	}

	&__left {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: 45%;
		min-width: 380px;
		max-width: 640px;
		min-height: 0;
		padding: 18px 20px 0;
		border-right: 1px solid $border;
		background: $bg-panel;
	}

	&__right {
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 28px;
	}

	&__title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: $text-primary;
	}

	&__lists {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-bottom: 18px;
	}

	&__section {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	&__heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 24px;
		padding: 0 4px 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: $text-muted;
	}

	&__search {
		margin-bottom: 4px;
	}

	&__placeholder {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px;
		text-align: center;
		color: $text-dim;

		p {
			margin: 0;
		}
	}

	&__placeholder-icon {
		width: 40px;
		height: 40px;
		fill: $text-faint;
	}
}
</style>
