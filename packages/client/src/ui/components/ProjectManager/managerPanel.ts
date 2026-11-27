import type {IProject} from '@/domain';

/** What the right side of the project manager shows. */
export type TManagerPanel =
	| {kind: 'empty'}
	| {kind: 'project'; id: string}
	| {kind: 'duplicate'; source: IProject}
	| {kind: 'open' | 'clone' | 'create'};

export type TRepoActionKind = 'open' | 'clone' | 'create';

export interface IRepoAction {
	kind: TRepoActionKind;
	label: string;
	hint: string;
	icon: string;
}

/** The three ways to add a repository, as the manager offers them. */
export const REPO_ACTIONS: ReadonlyArray<IRepoAction> = [
	{kind: 'open', label: 'Open', hint: 'An existing repository on disk or a server', icon: 'mdi-folder-open-outline'},
	{kind: 'clone', label: 'Clone', hint: 'From a URL over SSH or HTTPS', icon: 'mdi-cloud-download-outline'},
	{kind: 'create', label: 'Create', hint: 'A new, empty repository', icon: 'mdi-folder-plus-outline'},
];
