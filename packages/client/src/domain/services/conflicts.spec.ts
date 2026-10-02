import {describe, it, expect} from 'vitest';
import {
	parseConflicts,
	buildSide,
	buildInitialResult,
	resolveConflict,
	countConflictMarkers,
	type IConflictBlock,
} from './conflicts';

const ONE_CONFLICT = [
	'import x',
	'<<<<<<< HEAD',
	'const a = 1;',
	'=======',
	'const a = 2;',
	'const b = 3;',
	'>>>>>>> feature',
	'export a',
	'',
].join('\n');

const TWO_CONFLICTS = [
	'<<<<<<< HEAD',
	'top ours',
	'=======',
	'top theirs',
	'>>>>>>> feature',
	'middle',
	'<<<<<<< HEAD',
	'=======',
	'added by them',
	'>>>>>>> feature',
	'',
].join('\n');

function conflicts(text: string): Array<IConflictBlock> {
	return parseConflicts(text).filter((b): b is IConflictBlock => b.type === 'conflict');
}

describe('parseConflicts', () => {
	it('splits context from conflict blocks and reads both labels', () => {
		const blocks = parseConflicts(ONE_CONFLICT);

		expect(blocks.map(b => b.type)).toEqual(['context', 'conflict', 'context']);

		const [conflict] = conflicts(ONE_CONFLICT);

		expect(conflict!.ours).toEqual(['const a = 1;']);
		expect(conflict!.theirs).toEqual(['const a = 2;', 'const b = 3;']);
		expect(conflict!.oursLabel).toBe('HEAD');
		expect(conflict!.theirsLabel).toBe('feature');
	});

	it('keeps the marker block verbatim so it can be put back', () => {
		const [conflict] = conflicts(ONE_CONFLICT);

		expect(conflict!.raw).toEqual([
			'<<<<<<< HEAD',
			'const a = 1;',
			'=======',
			'const a = 2;',
			'const b = 3;',
			'>>>>>>> feature',
		]);
	});

	it('drops the diff3 base section from the sides but keeps it in the raw block', () => {
		const text = [
			'<<<<<<< HEAD',
			'ours',
			'||||||| base',
			'original',
			'=======',
			'theirs',
			'>>>>>>> feature',
		].join('\n');

		const [conflict] = conflicts(text);

		expect(conflict!.ours).toEqual(['ours']);
		expect(conflict!.theirs).toEqual(['theirs']);
		expect(conflict!.raw).toHaveLength(7);
	});

	it('handles an empty side', () => {
		const [, second] = conflicts(TWO_CONFLICTS);

		expect(second!.ours).toEqual([]);
		expect(second!.theirs).toEqual(['added by them']);
	});

	it('returns a single context block for a file without conflicts', () => {
		expect(parseConflicts('a\nb\n')).toEqual([{type: 'context', lines: ['a', 'b', '']}]);
	});
});

describe('buildSide', () => {
	it('replaces every conflict with one side and reports where each landed', () => {
		const blocks = parseConflicts(ONE_CONFLICT);

		expect(buildSide(blocks, 'ours')).toEqual({
			text: 'import x\nconst a = 1;\nexport a\n',
			regions: [{startLine: 2, lineCount: 1}],
		});

		expect(buildSide(blocks, 'theirs')).toEqual({
			text: 'import x\nconst a = 2;\nconst b = 3;\nexport a\n',
			regions: [{startLine: 2, lineCount: 2}],
		});
	});

	it('gives an empty side a zero-line region at the line that follows it', () => {
		const side = buildSide(parseConflicts(TWO_CONFLICTS), 'ours');

		expect(side.text).toBe('top ours\nmiddle\n');
		expect(side.regions).toEqual([
			{startLine: 1, lineCount: 1},
			{startLine: 3, lineCount: 0},
		]);
	});
});

describe('buildInitialResult', () => {
	it('starts as the file with its markers, each conflict tracked by its raw block', () => {
		const result = buildInitialResult(parseConflicts(TWO_CONFLICTS));

		expect(result.text).toBe(TWO_CONFLICTS);
		expect(result.regions).toEqual([
			{startLine: 1, lineCount: 5},
			{startLine: 7, lineCount: 4},
		]);
	});
});

describe('resolveConflict', () => {
	const [conflict] = conflicts(ONE_CONFLICT);

	it('takes one side', () => {
		expect(resolveConflict(conflict!, {ours: true, theirs: false})).toEqual(['const a = 1;']);
		expect(resolveConflict(conflict!, {ours: false, theirs: true})).toEqual(['const a = 2;', 'const b = 3;']);
	});

	it('takes both, current first', () => {
		expect(resolveConflict(conflict!, {ours: true, theirs: true}))
			.toEqual(['const a = 1;', 'const a = 2;', 'const b = 3;']);
	});

	it('puts the markers back when neither side is chosen', () => {
		expect(resolveConflict(conflict!, {ours: false, theirs: false})).toEqual(conflict!.raw);
	});
});

describe('countConflictMarkers', () => {
	it('counts conflict openings', () => {
		expect(countConflictMarkers(TWO_CONFLICTS)).toBe(2);
		expect(countConflictMarkers('clean\nfile\n')).toBe(0);
	});

	it('still counts a conflict with only one of its markers left', () => {
		expect(countConflictMarkers('<<<<<<< HEAD\nours\n=======\ntheirs\n')).toBe(1);
		expect(countConflictMarkers('ours\n=======\ntheirs\n>>>>>>> feature\n')).toBe(1);
	});

	it('ignores a separator line on its own, which is ordinary content in many formats', () => {
		expect(countConflictMarkers('Title\n=======\n')).toBe(0);
	});
});
