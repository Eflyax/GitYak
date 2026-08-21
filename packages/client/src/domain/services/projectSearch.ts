import type {IProject} from '@/domain/models/Project';

/**
 * Filters projects by a free-text query. The query is split into whitespace
 * separated tokens; every token must appear (case-insensitively) in the alias,
 * path or server of a project, in any order and in any of those fields.
 * Results are ranked: alias prefix > alias substring > last path segment >
 * anywhere else. Ties keep the original project order.
 */
export function filterProjects<T extends IProject>(projects: readonly T[], query: string): T[] {
	const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

	if (!tokens.length) {
		return [...projects];
	}

	return projects
		.map((project, index) => ({project, index, score: scoreProject(project, tokens)}))
		.filter(entry => entry.score > 0)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(entry => entry.project);
}

function scoreProject(project: IProject, tokens: string[]): number {
	const alias = project.alias.toLowerCase();
	const path = project.path.toLowerCase();
	const server = (project.server ?? '').toLowerCase();
	const lastSegment = path.split(/[\\/]/).filter(Boolean).pop() ?? '';

	let total = 0;

	for (const token of tokens) {
		let score = 0;

		if (alias.startsWith(token)) {
			score = 4;
		}
		else if (alias.includes(token)) {
			score = 3;
		}
		else if (lastSegment.includes(token)) {
			score = 2;
		}
		else if (path.includes(token) || server.includes(token)) {
			score = 1;
		}

		if (!score) {
			return 0;
		}

		total += score;
	}

	return total;
}
