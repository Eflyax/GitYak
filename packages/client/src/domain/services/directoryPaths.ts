/**
 * The directory itself followed by each of its ancestors, ending at the root. A project
 * whose directory has been deleted still carries that path, so the file browser walks this
 * list to find the nearest directory it can actually open.
 */
export function ancestorPaths(path: string): Array<string> {
	const segments = path.split('/').filter(Boolean);
	const paths: Array<string> = [];

	for (let count = segments.length; count > 0; count--) {
		paths.push('/' + segments.slice(0, count).join('/'));
	}

	paths.push('/');

	return paths;
}

/** The containing directory, or the root when there is none above it. */
export function parentPath(path: string): string {
	return ancestorPaths(path)[1] ?? '/';
}
