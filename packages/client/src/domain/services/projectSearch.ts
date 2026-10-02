import type {IProject} from '@/domain/models/Project';

/**
 * Filters projects by a free-text query. The query is split into whitespace
 * separated tokens; every token must appear (case-insensitively) in the alias,
 * path or server of a project, in any order and in any of those fields.
 *
 * Matches are ranked by how often the project was opened, most first. Between
 * equally opened projects the text match decides: alias prefix > alias
 * substring > last path segment > anywhere else. Remaining ties keep the
 * original project order. An empty query keeps every project, ranked by
 * open count alone.
 */
export function filterProjects<T extends IProject>(projects: readonly T[], query: string): T[] {
	const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

	return projects
		.map((project, index) => ({
			project,
			index,
			opened: project.openCount ?? 0,
			score: tokens.length ? scoreProject(project, tokens) : 1,
		}))
		.filter(entry => entry.score > 0)
		.sort((a, b) => b.opened - a.opened || b.score - a.score || a.index - b.index)
		.map(entry => entry.project);
}

/**
 * How full a project's open-frequency bar is, from 0 to 1, relative to the most
 * opened project. Logarithmic, so that a project opened 5 times next to one
 * opened 200 times still shows a visible bar rather than a sliver.
 */
export function openFrequency(openCount: number | undefined, maxOpenCount: number): number {
	const count = openCount ?? 0;

	if (count <= 0 || maxOpenCount <= 0) {
		return 0;
	}

	return Math.min(1, Math.log1p(count) / Math.log1p(maxOpenCount));
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
