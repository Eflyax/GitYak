export const CLONE_SSH_COMMAND = 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes';

export const UNSET_CLONE_SSH_ARGS = ['config', '--unset', 'core.sshCommand'];

export function repoNameFromUrl(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
	const segments = trimmed.split(/[/:]/);

	return (segments[segments.length - 1] ?? '').trim();
}

export function joinRepoPath(parent: string, name: string): string {
	return `${parent.replace(/\/+$/, '')}/${name}`;
}

export function cloneArgs(url: string, name: string): Array<string> {
	return ['clone', '--progress', '--config', `core.sshCommand=${CLONE_SSH_COMMAND}`, '--', url, name];
}

export function initArgs(name: string): Array<string> {
	return ['init', '--', name];
}

/** Works on old git without `init -b` (e.g. 2.25). */
export function setInitialBranchArgs(branch: string): Array<string> {
	return ['symbolic-ref', 'HEAD', `refs/heads/${branch}`];
}

/** Git's own check, run before anything is created; prints the name back when it is valid. */
export function checkBranchNameArgs(branch: string): Array<string> {
	return ['check-ref-format', '--branch', branch];
}

/**
 * A quick check while typing, following git-check-ref-format's rules; the authority is git
 * itself (`checkBranchNameArgs`), asked before the repository is created.
 */
export function isValidBranchName(name: string): boolean {
	return name.length > 0
		&& name !== '@'
		&& !/\s/.test(name)
		&& ![...name].some(ch => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)
		&& !name.startsWith('-')
		&& !name.startsWith('/')
		&& !name.endsWith('/')
		&& !name.endsWith('.')
		&& !name.endsWith('.lock')
		&& !name.includes('..')
		&& !name.includes('//')
		&& !name.includes('@{')
		&& !/(^|\/)\./.test(name)
		&& !/[~^:?*[\\]/.test(name);
}
