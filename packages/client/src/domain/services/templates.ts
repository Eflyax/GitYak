/** Trims the entries, drops blank ones and keeps the first of any duplicates. */
export function normalizeTemplates(templates: ReadonlyArray<string>): Array<string> {
	const result: Array<string> = [];

	for (const template of templates) {
		const trimmed = template.trim();

		if (trimmed && !result.includes(trimmed)) {
			result.push(trimmed);
		}
	}

	return result;
}

/** The project's commit template wins; the global one applies only when the project has none. */
export function resolveCommitTemplate(projectTemplate: string | undefined, globalTemplate: string): string {
	return projectTemplate ? projectTemplate : globalTemplate;
}

/** Project branch templates come first, followed by the global ones it does not repeat. */
export function resolveBranchTemplates(
	projectTemplates: ReadonlyArray<string> | undefined,
	globalTemplates: ReadonlyArray<string>,
): Array<string> {
	return normalizeTemplates([...(projectTemplates ?? []), ...globalTemplates]);
}

/**
 * Puts `template` in front of the branch name. A prefix the name already starts with from
 * `templates` is replaced, so picking "bugfix/" on "feature/login" gives "bugfix/login".
 */
export function applyBranchTemplate(name: string, template: string, templates: ReadonlyArray<string>): string {
	const current = templates
		.filter(t => name.startsWith(t))
		.reduce((longest, t) => (t.length > longest.length ? t : longest), '');

	return template + name.slice(current.length);
}
