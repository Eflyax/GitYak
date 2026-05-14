import {ref, readonly} from 'vue';
import type {IProject, IProjectGroup} from '@/domain';
import {EServerType} from '@/domain';
import {useWebSocket} from '@/composables/useWebSocket';
const PROJECTS_KEY = 'git-yak:projects';
const GROUPS_KEY = 'git-yak:groups';
const LAST_OPEN_PROJECT = 'git-yak:lastProjectId';

const projects = ref<IProject[]>(loadFromStorage<IProject[]>(PROJECTS_KEY, []).map(migrateProject));
const groups = ref<IProjectGroup[]>(loadFromStorage<IProjectGroup[]>(GROUPS_KEY, []));
const currentProject = ref<IProject | null>(null);
const selectedGroupFilter = ref<string | null>(null);

function migrateProject(p: IProject): IProject {
	return {
		...p,
		serverType: p.serverType ?? EServerType.Bun,
	};
}

function loadFromStorage<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);

		return raw ? (JSON.parse(raw) as T) : fallback;
	}
	catch {
		return fallback;
	}
}

function saveProjects(): void {
	try {
		localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.value));
	}
	catch {
		console.error('localStorage is not available');
	}
}

function saveGroups(): void {
	try {
		localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.value));
	}
	catch {}
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useProject() {
	const
		{connect} = useWebSocket();

	async function openProject(project: IProject): Promise<void> {
		const
			updated = updateProject(project.id, {dateLastOpen: Date.now()});

		localStorage.setItem(LAST_OPEN_PROJECT, project.id);

		await connect(project);

		currentProject.value = updated ?? project;
	}

	function closeProject(): void {
		currentProject.value = null;
		localStorage.removeItem(LAST_OPEN_PROJECT);
	}

	function openLastOpenProject() {
		const lastProjectId = localStorage.getItem(LAST_OPEN_PROJECT);

		if (lastProjectId) {
			const project = getProject(lastProjectId);

			if (project) {
				openProject(project).catch(() => {
					// Silent failure if server is not available on startup
				});
			}
		}
	}

	function getProject(id: string): IProject | null {
		return projects.value.find(p => p.id === id) ?? null;
	}

	function addProject(data: Omit<IProject, 'id' | 'order' | 'dateCreated' | 'dateLastOpen'>): IProject {
		const project: IProject = {
			...data,
			id: generateId(),
			order: projects.value.length,
			dateCreated: Date.now(),
			dateLastOpen: Date.now(),
		};

		projects.value.push(project);
		saveProjects();

		return project;
	}

	function removeProject(id: string): void {
		const index = projects.value.findIndex(p => p.id === id);

		if (index !== -1) {
			projects.value.splice(index, 1);

			if (currentProject.value?.id === id) {
				currentProject.value = null;
			}

			saveProjects();
		}
	}

	function updateProject(id: string, updates: Partial<Omit<IProject, 'id'>>): IProject | null {
		const project = projects.value.find(p => p.id === id);

		if (!project) return null;

		Object.assign(project, updates);
		saveProjects();

		return project;
	}

	function addGroup(data: Omit<IProjectGroup, 'id'>): IProjectGroup {
		const group: IProjectGroup = {
			...data,
			id: generateId(),
		};

		groups.value.push(group);
		saveGroups();

		return group;
	}

	function removeGroup(id: string): void {
		const index = groups.value.findIndex(g => g.id === id);

		if (index !== -1) {
			groups.value.splice(index, 1);

			projects.value.forEach(p => {
				if (p.groupId === id) {
					p.groupId = undefined;
				}
			});

			saveGroups();
			saveProjects();
		}
	}

	function updateGroup(id: string, updates: Partial<Omit<IProjectGroup, 'id'>>): void {
		const group = groups.value.find(g => g.id === id);

		if (group) {
			Object.assign(group, updates);
			saveGroups();
		}
	}

	function assignProjectToGroup(projectId: string, groupId: string | null): void {
		updateProject(projectId, {groupId: groupId ?? undefined});
	}

	return {
		projects: readonly(projects),
		groups: readonly(groups),
		currentProject: readonly(currentProject),
		selectedGroupFilter,
		openProject,
		closeProject,
		addProject,
		removeProject,
		updateProject,
		addGroup,
		removeGroup,
		updateGroup,
		assignProjectToGroup,
		openLastOpenProject
	};
}
