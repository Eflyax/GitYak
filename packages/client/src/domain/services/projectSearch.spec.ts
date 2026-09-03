import {describe, expect, it} from 'vitest';
import {filterProjects} from './projectSearch';
import type {IProject} from '@/domain/models/Project';
import {EServerType} from '@/domain';

function project(alias: string, path: string, server = 'localhost'): IProject {
	return {
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
		const items = [
			project('Zebra tools', '/unrelated/one'),   // alias substring  -> 3
			project('Alpha', '/home/me/tools'),         // last path segment -> 2
			project('Tools kit', '/unrelated/two'),     // alias prefix      -> 4
		];

		expect(filterProjects(items, 'tools').map(p => p.alias))
			.toEqual(['Tools kit', 'Zebra tools', 'Alpha']);
	});
});
