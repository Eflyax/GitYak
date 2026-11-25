/**
 * View of an image: scaled by `scale` and shifted by `x`/`y` pixels from its fitted, centred
 * position. Points are measured from the centre of the viewport, which is where the image's
 * transform origin sits.
 */
export interface IZoomPan {
	scale: number;
	x: number;
	y: number;
}

export interface IPoint {
	x: number;
	y: number;
}

export const
	ZOOM_MIN = 0.1,
	ZOOM_MAX = 32,
	/** Factor of one zoom-in/out button press. */
	ZOOM_STEP = 1.25;

export const INITIAL_VIEW: Readonly<IZoomPan> = {scale: 1, x: 0, y: 0};

export function clampScale(scale: number): number {
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * Zooms by `factor` keeping the image point under `anchor` where it is, so the content
 * under the cursor stays put. The anchor defaults to the centre of the viewport.
 */
export function zoomAt(view: IZoomPan, factor: number, anchor: IPoint = {x: 0, y: 0}): IZoomPan {
	const scale = clampScale(view.scale * factor);
	const ratio = scale / view.scale;

	return {
		scale,
		x: anchor.x - (anchor.x - view.x) * ratio,
		y: anchor.y - (anchor.y - view.y) * ratio,
	};
}

export function panBy(view: IZoomPan, dx: number, dy: number): IZoomPan {
	return {...view, x: view.x + dx, y: view.y + dy};
}

/** Zoom factor of a wheel event; exponential, so trackpads (small deltas) zoom smoothly. */
export function wheelZoomFactor(deltaY: number): number {
	return Math.exp(-deltaY * 0.002);
}
