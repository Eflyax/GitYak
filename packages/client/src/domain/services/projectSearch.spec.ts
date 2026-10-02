import {describe, expect, it} from 'vitest';
import {filterProjects, openFrequency} from './projectSearch';
import type {IProject} from '@/domain/models/Project';
import {EServerType} from '@/domain';

function project(alias: string, path: string, server = 'localhost', openCount?: number): IProject {
	return {
		openCount,
		id: alias,
		order: 0,
		alias,
		path,
		server,
		port: 3000,
		dateCreated: 0,
		dateLastOpen: 0,
		serverType: EServerType.Bun,
	};
}

const PROJECTS = [
	project('Alpha', '/home/me/work/alpha'),
	project('Beta', '/home/me/side/beta-tools'),
	project('Gamma', '/srv/gamma', 'build-01'),
];

describe('filterProjects', () => {
	it('returns everything for an empty or whitespace query', () => {
		expect(filterProjects(PROJECTS, '')).toHaveLength(3);
		expect(filterProjects(PROJECTS, '   ')).toHaveLength(3);
	});

	it('returns a copy rather than the original array', () => {
		expect(filterProjects(PROJECTS, '')).not.toBe(PROJECTS);
	});

	it('matches the alias case-insensitively', () => {
		expect(filterProjects(PROJECTS, 'alpha').map(p => p.alias)).toEqual(['Alpha']);
		expect(filterProjects(PROJECTS, 'ALPHA').map(p => p.alias)).toEqual(['Alpha']);
	});

	it('matches on the path and on the server', () => {
		expect(filterProjects(PROJECTS, 'side').map(p => p.alias)).toEqual(['Beta']);
		expect(filterProjects(PROJECTS, 'build-01').map(p => p.alias)).toEqual(['Gamma']);
	});

	it('requires every token to match, in any field and any order', () => {
		expect(filterProjects(PROJECTS, 'beta side').map(p => p.alias)).toEqual(['Beta']);
		expect(filterProjects(PROJECTS, 'beta nonsense')).toEqual([]);
	});

	it('returns nothing when no project matches', () => {
		expect(filterProjects(PROJECTS, 'zzz')).toEqual([]);
	});

	it('ranks an alias prefix above a path-only match', () => {
		const items = [
			project('Tools', '/home/me/unrelated'),
			project('Zebra', '/home/me/tools-elsewhere'),
		];

		expect(filterProjects(items, 'tools').map(p => p.alias)).toEqual(['Tools', 'Zebra']);
	});

	it('ranks the last path segment above a match deeper in the path', () => {
		const items = [
			project('One', '/deep/widget/other'),
			project('Two', '/other/widget'),
		];

		expect(filterProjects(items, 'widget').map(p => p.alias)).toEqual(['Two', 'One']);
	});

	it('keeps the original order when scores tie', () => {
		const items = [project('Same A', '/x/same'), project('Same B', '/y/same')];

		expect(filterProjects(items, 'same').map(p => p.alias)).toEqual(['Same A', 'Same B']);
	});

	it('ranks an alias substring below an alias prefix and above a path segment', () => {
		// Order matters here: the sort is stable, so the lower-ranked item is listed FIRST.
		// With the tier-2 project ahead of the tier-3 one, a regression that collapsed the
		// two tiers would reverse them in the output — which is what makes this test able to
		// fail. Listing them the other way round proves only 4 > 3.
		const items = [
			project('Alpha', '/home/me/tools'),         // last path segment -> 2
			project('Zebra tools', '/unrelated/one'),   // alias substring   -> 3
			project('Tools kit', '/unrelated/two'),     // alias prefix      -> 4
		];

		expect(filterProjects(items, 'tools').map(p => p.alias))
			.toEqual(['Tools kit', 'Zebra tools', 'Alpha']);
	});
});

describe('filterProjects by open count', () => {
	it('lists the most opened projects first when there is no query', () => {
		const items = [
			project('Rare', '/a', 'localhost', 1),
			project('Never', '/b'),
			project('Often', '/c', 'localhost', 9),
		];

		expect(filterProjects(items, '').map(p => p.alias)).toEqual(['Often', 'Rare', 'Never']);
	});

	it('lets a more opened project outrank a better text match', () => {
		const items = [
			project('Tools', '/home/me/unrelated', 'localhost', 1),   // alias prefix
			project('Zebra', '/home/me/tools-elsewhere', 'localhost', 5), // path only
		];

		expect(filterProjects(items, 'tools').map(p => p.alias)).toEqual(['Zebra', 'Tools']);
	});

	it('falls back to the text match between equally opened projects', () => {
		const items = [
			project('Zebra', '/home/me/tools-elsewhere', 'localhost', 3),
			project('Tools', '/home/me/unrelated', 'localhost', 3),
		];

		expect(filterProjects(items, 'tools').map(p => p.alias)).toEqual(['Tools', 'Zebra']);
	});

	it('still leaves out projects that do not match, however often they were opened', () => {
		const items = [project('Popular', '/a', 'localhost', 100), project('Wanted', '/b')];

		expect(filterProjects(items, 'wanted').map(p => p.alias)).toEqual(['Wanted']);
	});
});

describe('openFrequency', () => {
	it('is empty for a project never opened and full for the most opened one', () => {
		expect(openFrequency(0, 10)).toBe(0);
		expect(openFrequency(undefined, 10)).toBe(0);
		expect(openFrequency(10, 10)).toBe(1);
	});

	it('is empty for everyone while nothing has been opened yet', () => {
		expect(openFrequency(0, 0)).toBe(0);
	});

	it('uses a logarithmic scale so rarely opened projects stay visible', () => {
		// Linear would give 5/200 = 0.025, a bar too short to see.
		expect(openFrequency(5, 200)).toBeCloseTo(Math.log(6) / Math.log(201));
		expect(openFrequency(5, 200)).toBeGreaterThan(0.3);
	});

	it('never exceeds a full bar', () => {
		expect(openFrequency(50, 10)).toBe(1);
	});
});
