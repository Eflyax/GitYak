<template>
	<div class="sidebar">
		<!-- Search -->
		<div class="sidebar__search">
			<Icon
				test-id="sidebar-toggle-btn"
				:name="sidebarCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'"
				class="sidebar__collapse-btn"
				@click="toggle"
			/>
			<n-input
				test-id="filter-branches-input"
				v-if="!sidebarCollapsed"
				v-model:value="searchQuery"
				placeholder="Filter branches…"
				size="small"
				clearable
			>
				<template #prefix>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.5">
						<path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5Z"/>
					</svg>
				</template>
			</n-input>
		</div>

		<!-- Branch list -->
		<div v-if="!sidebarCollapsed" class="sidebar__branches">
			<!-- LOCAL -->
			<div class="sidebar__section">
				<div
					test-id="local-branches-header"
					class="sidebar__section-header"
					@click="localExpanded = !localExpanded"
				>
					<svg
						class="sidebar__chevron"
						:class="{'sidebar__chevron--open': localExpanded}"
						width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
					>
						<path d="M7 10l5 5 5-5z"/>
					</svg>
					<span>LOCAL</span>
					<span class="sidebar__section-count">({{ filteredLocalBranches.length }})</span>
				</div>

				<template v-if="localExpanded">
					<BranchItem
						v-for="branch in filteredLocalBranches"
						:key="branch.name"
						:name="branch.name"
						:color="branchColor(branch.name)"
						:is-active="branch.isCurrent"
						@select="switchBranch(branch.name)"
						@contextmenu.prevent="contextMenuRef($event, localRefTarget(branch.name))"
					/>
				</template>
			</div>

			<!-- REMOTE -->
			<div class="sidebar__section">
				<div
					test-id="remote-branches-header"
					class="sidebar__section-header"
					@click="remoteExpanded = !remoteExpanded"
				>
					<svg
						class="sidebar__chevron"
						:class="{'sidebar__chevron--open': remoteExpanded}"
						width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
					>
						<path d="M7 10l5 5 5-5z"/>
					</svg>
					<span>REMOTE</span>
					<span class="sidebar__section-count">({{ filteredRemoteBranches.length }})</span>
				</div>

				<template v-if="remoteExpanded">
					<BranchItem
						v-for="branch in filteredRemoteBranches"
						:key="branch.name"
						:name="branch.name"
						:color="branchColor(shortBranchName(branch.name))"
						:is-remote="true"
						@select="() => {}"
						@contextmenu.prevent="contextMenuRef($event, remoteRefTarget(branch.name))"
					/>
				</template>
			</div>

			<!-- TAGS -->
			<div class="sidebar__section">
				<div
					test-id="tags-header"
					class="sidebar__section-header"
					@click="tagsExpanded = !tagsExpanded"
				>
					<svg
						class="sidebar__chevron"
						:class="{'sidebar__chevron--open': tagsExpanded}"
						width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
					>
						<path d="M7 10l5 5 5-5z"/>
					</svg>
					<span>TAGS</span>
					<span class="sidebar__section-count">({{ filteredTags.length }})</span>
				</div>

				<template v-if="tagsExpanded">
					<div
						v-for="tag in filteredTags"
						:key="tag.name"
						test-id="tag-item"
						class="sidebar__tag-item"
						@contextmenu.prevent="contextMenuRef($event, {name: tag.name, isLocal: true, remotes: remoteTags.includes(tag.name) ? ['origin'] : [], isTag: true})"
					>
						<Icon name="mdi-tag-outline" class="sidebar__tag-icon" />
						<Icon name="mdi-laptop" class="sidebar__tag-icon" title="Local" />
						<Icon v-if="remoteTags.includes(tag.name)" name="mdi-cloud-outline" class="sidebar__tag-icon" title="Remote" />
						<span class="sidebar__tag-name">{{ tag.name }}</span>
					</div>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue';
import {NInput} from 'naive-ui';
import BranchItem from './BranchItem.vue';
import Icon from '@/ui/components/Icon.vue';
import {useLayout} from '@/composables/useLayout';
import {useBranches} from '@/composables/useBranches';
import {useTags} from '@/composables/useTags';
import {useContextMenu} from '@/composables/useContextMenu';

const {sidebarCollapsed, collapseSidebar, expandSidebar} = useLayout();
const {branches, switchBranch, loadBranches} = useBranches();
const {tags, remoteTags, loadTags, loadRemoteTags} = useTags();
const {contextMenuRef} = useContextMenu();

function toggle(): void {
	sidebarCollapsed.value ? expandSidebar() : collapseSidebar();
}

const COLORS = [
	'#6f9ef8', '#f89b6f', '#6ff8a0', '#f86f6f',
	'#c46ff8', '#f8e56f', '#6feef8', '#f86fc4',
];

function branchColor(name: string): string {
	let hash = 0;

	for (const c of name) {
		hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
	}

	return COLORS[hash % COLORS.length]!;
}

function shortBranchName(fullName: string): string {
	const parts = fullName.split('/');

	return parts.slice(1).join('/');
}

function remoteName(fullName: string): string {
	return fullName.split('/')[0] ?? 'origin';
}

function localRefTarget(name: string) {
	const remoteNames = branches.value
		.filter(b => b.isRemote && shortBranchName(b.name) === name)
		.map(b => remoteName(b.name));

	return {name, isLocal: true, remotes: remoteNames, isTag: false};
}

function remoteRefTarget(fullName: string) {
	const name = shortBranchName(fullName);
	const remote = remoteName(fullName);
	const isLocal = branches.value.some(b => !b.isRemote && b.name === name);

	return {name, isLocal, remotes: [remote], isTag: false};
}

const searchQuery = ref('');
const localExpanded = ref(true);
const remoteExpanded = ref(false);
const tagsExpanded = ref(false);

const localBranches = computed(() => branches.value.filter(b => !b.isRemote));
const remoteBranches = computed(() => branches.value.filter(b => b.isRemote));

const filteredLocalBranches = computed(() => {
	const q = searchQuery.value.toLowerCase();

	return q ? localBranches.value.filter(b => b.name.toLowerCase().includes(q)) : localBranches.value;
});

const filteredRemoteBranches = computed(() => {
	const q = searchQuery.value.toLowerCase();

	return q ? remoteBranches.value.filter(b => b.name.toLowerCase().includes(q)) : remoteBranches.value;
});

const filteredTags = computed(() => {
	const q = searchQuery.value.toLowerCase();

	return q ? tags.value.filter(t => t.name.toLowerCase().includes(q)) : tags.value;
});

onMounted(async () => {
	await Promise.all([loadBranches(), loadTags(), loadRemoteTags()]);
});
</script>

<style scoped lang="scss">
.sidebar {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: $bg-panel;
	user-select: none;

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 10px 8px;
		border-bottom: 1px solid $border;
		flex-shrink: 0;
	}

	&__project-name {
		font-size: 13px;
		font-weight: 600;
		color: $text-primary;
	}

	&__branch-badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 10px;
		background-color: rgba($color-teal, 0.2);
		color: $color-teal;
		font-weight: 600;
		cursor: pointer;

		&:hover {
			background-color: rgba($color-teal, 0.3);
		}
	}

	&__search {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 8px 4px;
		flex-shrink: 0;
	}

	&__collapse-btn {
		flex-shrink: 0;
		margin-left: auto;
		width: 24px;
		height: 24px;
		cursor: pointer;
	}

	&__branches {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	&__section {
		cursor: pointer;
		margin-bottom: 4px;
	}

	&__section-count {
		margin-left: 10px;
		color: $text-faint;
	}

	&__chevron {
		transition: transform 0.15s ease;
		opacity: 0.6;

		&--open {
			transform: rotate(0deg);
		}

		&:not(&--open) {
			transform: rotate(-90deg);
		}
	}

	&__tag-item {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 3px 8px 3px 20px;
		cursor: pointer;
		border-radius: 3px;
		font-size: 12.5px;
		color: $text-muted;
		white-space: nowrap;
		overflow: hidden;

		&:hover {
			background-color: rgba($text-white, 0.05);
			color: $text-secondary;
		}
	}

	&__tag-icon {
		flex-shrink: 0;
		width: 13px;
		height: 13px;
		opacity: 0.6;
	}

	&__tag-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__section-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.5px;
		color: $text-faint;
		text-transform: uppercase;
		cursor: pointer;

		&:hover {
			color: $text-dim;
		}
	}

	&__footer {
		padding: 8px 12px;
		border-top: 1px solid $border;
		flex-shrink: 0;
	}

	&__stash-link {
		font-size: 11.5px;
		color: $text-faint;
		cursor: pointer;
		letter-spacing: 0.3px;

		&:hover {
			color: $text-muted;
		}
	}
}
</style>
