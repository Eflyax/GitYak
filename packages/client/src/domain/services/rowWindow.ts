export interface IRowWindow {
	/** First rendered row, inclusive. */
	start: number
	/** Last rendered row, exclusive. */
	end: number
}

/**
 * The rows of a fixed-height list that intersect the viewport, widened by `overscan` rows on
 * either side so a fast scroll does not show blank space before the next frame renders.
 */
export function computeRowWindow(
	scrollTop: number,
	viewportHeight: number,
	rowHeight: number,
	total: number,
	overscan: number,
): IRowWindow {
	const
		first = Math.floor(Math.max(0, scrollTop) / rowHeight),
		last = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight);

	return {
		start: Math.max(0, Math.min(total, first - overscan)),
		end: Math.max(0, Math.min(total, last + overscan)),
	};
}

export interface IGraphEdge {
	/** Row of the child commit. */
	from: number
	/** Row of the parent commit. */
	to: number
}

/**
 * The edges that cross a window of rows. An edge spans every row between its child and its
 * parent, so a long one whose two ends both lie outside the window still has to be drawn.
 */
export function edgesInWindow<T extends IGraphEdge>(
	edges: ReadonlyArray<T>,
	window: IRowWindow,
): Array<T> {
	return edges.filter(e => Math.min(e.from, e.to) < window.end && Math.max(e.from, e.to) >= window.start);
}

/**
 * The scroll offset that brings a row of a fixed-height list fully into view while moving the
 * list as little as possible, or `null` when the row is already fully visible.
 */
export function scrollTopToReveal(
	scrollTop: number,
	viewportHeight: number,
	index: number,
	rowHeight: number,
): number | null {
	const
		top = index * rowHeight,
		bottom = top + rowHeight;

	if (top < scrollTop) {
		return top;
	}

	if (bottom > scrollTop + viewportHeight) {
		return bottom - viewportHeight;
	}

	return null;
}
