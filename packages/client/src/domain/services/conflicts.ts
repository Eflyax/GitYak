export interface IContextBlock {
	type: 'context'
	lines: ReadonlyArray<string>
}

export interface IConflictBlock {
	type: 'conflict'
	ours: ReadonlyArray<string>
	theirs: ReadonlyArray<string>
	oursLabel: string
	theirsLabel: string
	/** The whole marker block, verbatim — what an unresolved conflict looks like in the file. */
	raw: ReadonlyArray<string>
}

export type TConflictFileBlock = IContextBlock | IConflictBlock;

export interface IConflictSelection {
	ours: boolean
	theirs: boolean
}

/** Where one conflict sits in a generated text. Lines are 1-based, as in Monaco. */
export interface IConflictRegion {
	startLine: number
	/** 0 for an empty side; startLine is then the line that follows it. */
	lineCount: number
}

export interface IConflictText {
	text: string
	/** One region per conflict, in file order. */
	regions: ReadonlyArray<IConflictRegion>
}

const OPENING = '<<<<<<<';
const BASE = '|||||||';
const SEPARATOR = '=======';
const CLOSING = '>>>>>>>';

/**
 * Splits a file git left with conflict markers into unchanged context and conflict blocks.
 * A diff3 base section (`||||||| … `) is not offered as a side but stays in `raw`.
 */
export function parseConflicts(text: string): Array<TConflictFileBlock> {
	const
		lines = text.split('\n'),
		blocks: Array<TConflictFileBlock> = [];

	let
		context: Array<string> = [],
		i = 0;

	const flushContext = (): void => {
		if (context.length) {
			blocks.push({type: 'context', lines: context});
			context = [];
		}
	};

	while (i < lines.length) {
		const line = lines[i]!;

		if (!line.startsWith(OPENING)) {
			context.push(line);
			++i;
			continue;
		}

		flushContext();

		const
			start = i,
			oursLabel = line.slice(OPENING.length).trim() || 'HEAD',
			ours: Array<string> = [],
			theirs: Array<string> = [];

		++i;

		while (i < lines.length && !lines[i]!.startsWith(SEPARATOR) && !lines[i]!.startsWith(BASE)) {
			ours.push(lines[i]!);
			++i;
		}

		if (i < lines.length && lines[i]!.startsWith(BASE)) {
			while (i < lines.length && !lines[i]!.startsWith(SEPARATOR)) {
				++i;
			}
		}

		++i; // the separator

		while (i < lines.length && !lines[i]!.startsWith(CLOSING)) {
			theirs.push(lines[i]!);
			++i;
		}

		const theirsLabel = (lines[i] ?? '').slice(CLOSING.length).trim() || 'incoming';

		++i; // the closing marker

		blocks.push({
			type: 'conflict',
			ours,
			theirs,
			oursLabel,
			theirsLabel,
			raw: lines.slice(start, i),
		});
	}

	flushContext();

	return blocks;
}

/** The lines a conflict resolves to. Choosing neither side puts the markers back. */
export function resolveConflict(block: IConflictBlock, selection: IConflictSelection): Array<string> {
	if (!selection.ours && !selection.theirs) {
		return [...block.raw];
	}

	return [
		...(selection.ours ? block.ours : []),
		...(selection.theirs ? block.theirs : []),
	];
}

function assemble(
	blocks: ReadonlyArray<TConflictFileBlock>,
	conflictLines: (block: IConflictBlock) => ReadonlyArray<string>,
): IConflictText {
	const
		out: Array<string> = [],
		regions: Array<IConflictRegion> = [];

	for (const block of blocks) {
		if (block.type === 'context') {
			out.push(...block.lines);
			continue;
		}

		const lines = conflictLines(block);

		regions.push({startLine: out.length + 1, lineCount: lines.length});
		out.push(...lines);
	}

	return {text: out.join('\n'), regions};
}

/** The whole file as one side sees it: every conflict replaced by that side's lines. */
export function buildSide(blocks: ReadonlyArray<TConflictFileBlock>, side: 'ours' | 'theirs'): IConflictText {
	return assemble(blocks, block => block[side]);
}

/** The result editor's starting point: the file as git left it, markers included. */
export function buildInitialResult(blocks: ReadonlyArray<TConflictFileBlock>): IConflictText {
	return assemble(blocks, block => block.raw);
}

/**
 * How many conflicts a text still carries. Opening and closing markers are counted apart so
 * that a half-deleted conflict still counts; the separator is ignored, since `=======` is
 * ordinary content in Markdown, reStructuredText and plain-text headings.
 */
export function countConflictMarkers(text: string): number {
	let
		opening = 0,
		closing = 0;

	for (const line of text.split('\n')) {
		if (line.startsWith(OPENING)) ++opening;
		else if (line.startsWith(CLOSING)) ++closing;
	}

	return Math.max(opening, closing);
}
