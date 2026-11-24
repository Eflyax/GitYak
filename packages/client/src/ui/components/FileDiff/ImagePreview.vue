<template>
	<div
		test-id="image-preview"
		class="image-preview"
	>
		<div class="image-preview__toolbar">
			<button
				test-id="image-zoom-out-btn"
				class="image-preview__tool"
				title="Zoom out"
				:disabled="view.scale <= ZOOM_MIN"
				@click="zoomBy(1 / ZOOM_STEP)"
			>
				<Icon name="mdi-magnify-minus-outline" />
			</button>
			<span
				test-id="image-zoom-level"
				class="image-preview__zoom"
			>{{ zoomLabel }}</span>
			<button
				test-id="image-zoom-in-btn"
				class="image-preview__tool"
				title="Zoom in"
				:disabled="view.scale >= ZOOM_MAX"
				@click="zoomBy(ZOOM_STEP)"
			>
				<Icon name="mdi-magnify-plus-outline" />
			</button>
			<button
				test-id="image-zoom-reset-btn"
				class="image-preview__tool"
				title="Reset view"
				:disabled="isInitialView"
				@click="resetView"
			>
				<Icon name="mdi-fit-to-screen-outline" />
			</button>
			<span class="image-preview__tip">Scroll to zoom, drag to move</span>
		</div>

		<div class="image-preview__sides">
			<div
				v-for="side in sides"
				:key="side.key"
				:test-id="`image-preview-${side.key}`"
				class="image-preview__side"
			>
				<div class="image-preview__head">
					<span
						class="image-preview__label"
						:class="`image-preview__label--${side.key}`"
					>{{ side.label }}</span>
					<span
						v-if="side.image"
						class="image-preview__meta"
					>
						<template v-if="dimensions[side.key]">{{ dimensions[side.key] }} · </template>{{ side.image.size }}
					</span>
				</div>

				<div
					class="image-preview__canvas"
					:class="{'image-preview__canvas--dragging': dragging}"
					@wheel.prevent="onWheel"
					@pointerdown="onPointerDown"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
				>
					<img
						v-if="side.image"
						:src="side.image.url"
						:alt="side.label"
						class="image-preview__img"
						:style="imageStyle"
						draggable="false"
						@load="onLoad(side.key, $event)"
						@error="dimensions[side.key] = 'cannot be displayed'"
					>
					<span
						v-else
						class="image-preview__empty"
					>{{ side.emptyText }}</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, reactive, ref, watch} from 'vue';
import Icon from '@/ui/components/Icon.vue';
import type {IImageSide} from '@/composables/useFileDiff';
import {INITIAL_VIEW, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, panBy, wheelZoomFactor, zoomAt} from '@/domain/services/zoomPan';
import type {IPoint, IZoomPan} from '@/domain/services/zoomPan';

type TSideKey = 'original' | 'modified';

const props = defineProps<{
	original: IImageSide | null;
	modified: IImageSide | null;
}>();

const dimensions = reactive<Record<TSideKey, string>>({original: '', modified: ''});

// Both sides are shown only when both exist; an added or deleted image is a single picture.
const sides = computed(() => {
	const
		before = {key: 'original' as const, label: 'Before', image: props.original, emptyText: 'Not present'},
		after = {key: 'modified' as const, label: 'After', image: props.modified, emptyText: 'Not present'};

	if (!props.original && props.modified) return [{...after, label: 'Added'}];
	if (props.original && !props.modified) return [{...before, label: 'Deleted'}];

	return [before, after];
});

// The parent remounts this component for every loaded diff, so a new file starts from the
// fitted view. Only an edit to the SVG source changes an image in place.
watch(() => props.modified?.url, () => (dimensions.modified = ''));

function onLoad(key: TSideKey, event: Event): void {
	const img = event.target as HTMLImageElement;

	// An SVG without width/height reports 0×0; its size then says nothing useful.
	dimensions[key] = img.naturalWidth && img.naturalHeight ? `${img.naturalWidth} × ${img.naturalHeight}` : '';
}

// ── Zoom & pan ───────────────────────────────────────────────────────────────
// One view drives both sides, so Before and After always show the same region of the image.

const view = ref<IZoomPan>({...INITIAL_VIEW});

const isInitialView = computed(() =>
	view.value.scale === INITIAL_VIEW.scale && view.value.x === INITIAL_VIEW.x && view.value.y === INITIAL_VIEW.y,
);

// Relative to the fitted size the image opens at, not to its pixel size.
const zoomLabel = computed(() => `${Math.round(view.value.scale * 100)} %`);

const imageStyle = computed(() => ({
	transform: `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.scale})`,
	// Zoomed-in pixels stay sharp squares, so pixel-level changes are visible.
	imageRendering: view.value.scale >= 4 ? 'pixelated' as const : 'auto' as const,
}));

function resetView(): void {
	view.value = {...INITIAL_VIEW};
}

function zoomBy(factor: number): void {
	view.value = zoomAt(view.value, factor);
}

/** Pointer position relative to the centre of the canvas it is over. */
function fromCanvasCentre(event: MouseEvent): IPoint {
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

	return {
		x: event.clientX - rect.left - rect.width / 2,
		y: event.clientY - rect.top - rect.height / 2,
	};
}

function onWheel(event: WheelEvent): void {
	view.value = zoomAt(view.value, wheelZoomFactor(event.deltaY), fromCanvasCentre(event));
}

const dragging = ref(false);
let lastPointer: IPoint | null = null;

function onPointerDown(event: PointerEvent): void {
	if (event.button !== 0) return;

	// Captured, so the drag continues when the pointer leaves the canvas.
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	lastPointer = {x: event.clientX, y: event.clientY};
	dragging.value = true;
}

function onPointerMove(event: PointerEvent): void {
	if (!lastPointer) return;

	view.value = panBy(view.value, event.clientX - lastPointer.x, event.clientY - lastPointer.y);
	lastPointer = {x: event.clientX, y: event.clientY};
}

function onPointerUp(event: PointerEvent): void {
	const canvas = event.currentTarget as HTMLElement;

	if (canvas.hasPointerCapture(event.pointerId)) {
		canvas.releasePointerCapture(event.pointerId);
	}

	lastPointer = null;
	dragging.value = false;
}
</script>

<style scoped lang="scss">
.image-preview {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background-color: $bg-app;

	&__toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px 6px;
		border-bottom: 1px solid $border;
		background-color: $bg-panel;
		flex-shrink: 0;
	}

	&__tool {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: $text-dim;
		cursor: pointer;

		svg {
			width: 15px;
			height: 15px;
		}

		&:hover:not(:disabled) {
			background-color: $bg-hover;
			color: $text-secondary;
		}

		&:disabled {
			opacity: 0.4;
			cursor: default;
		}
	}

	&__zoom {
		min-width: 48px;
		font-size: 11px;
		text-align: center;
		color: $text-secondary;
		font-variant-numeric: tabular-nums;
	}

	&__tip {
		margin-left: auto;
		font-size: 10.5px;
		color: $text-dim;
	}

	&__sides {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	&__side {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;

		& + & {
			border-left: 1px solid $border;
		}
	}

	&__head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		font-size: 11px;
		border-bottom: 1px solid $border;
		background-color: $bg-panel;
		flex-shrink: 0;
	}

	&__label {
		font-weight: 600;
		color: $text-secondary;

		&--original {
			color: $color-danger;
		}

		&--modified {
			color: $color-success;
		}
	}

	&__meta {
		color: $text-dim;
	}

	&__canvas {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px;
		overflow: hidden;
		cursor: grab;
		user-select: none;
		touch-action: none;
		// Checkerboard, so transparent areas are told apart from the image itself.
		background-color: $bg-panel;
		background-image:
			linear-gradient(45deg, $bg-section 25%, transparent 25%),
			linear-gradient(-45deg, $bg-section 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, $bg-section 75%),
			linear-gradient(-45deg, transparent 75%, $bg-section 75%);
		background-size: 16px 16px;
		background-position: 0 0, 0 8px, 8px -8px, -8px 0;

		&--dragging {
			cursor: grabbing;
		}
	}

	&__img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		// A vector without intrinsic size would otherwise collapse to nothing.
		min-width: 16px;
		min-height: 16px;
		pointer-events: none;
		will-change: transform;
	}

	&__empty {
		font-size: 12px;
		color: $text-muted;
	}
}
</style>
