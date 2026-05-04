export interface IUseWindowFocus {
	onFocus: (callback: () => void, debounceMs?: number) => void;
	destroy: () => void;
}

function debounce(fn: () => void, ms: number): { call: () => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		call: () => {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			timer = setTimeout(fn, ms);
		},
		cancel: () => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}

export const useWindowFocus: () => IUseWindowFocus = () => {
	let
		debouncedCallback: ReturnType<typeof debounce> | undefined,
		visibilityHandler: (() => void) | undefined,
		focusHandler: (() => void) | undefined;

	function onFocus(callback: () => void, debounceMs = 800): void {
		destroy();

		const db = debounce(callback, debounceMs);
		debouncedCallback = db;

		visibilityHandler = () => {
			if (document.visibilityState === 'visible') {
				db.call();
			}
		};

		focusHandler = () => {
			db.call();
		};

		document.addEventListener('visibilitychange', visibilityHandler);
		window.addEventListener('focus', focusHandler);
	}

	function destroy(): void {
		if (debouncedCallback !== undefined) {
			debouncedCallback.cancel();
		}
		if (visibilityHandler !== undefined) {
			document.removeEventListener('visibilitychange', visibilityHandler);
		}
		if (focusHandler !== undefined) {
			window.removeEventListener('focus', focusHandler);
		}
	}

	const instance: IUseWindowFocus = {
		onFocus,
		destroy,
	};

	return instance;
};
