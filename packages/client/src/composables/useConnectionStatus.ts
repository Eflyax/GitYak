import {ref, computed, readonly} from 'vue';

export type ConnectionPhase =
	| 'idle'
	| 'connecting'
	| 'checking'
	| 'uploading'
	| 'starting'
	| 'tunneling'
	| 'error';

const phase = ref<ConnectionPhase>('idle');
const uploadProgress = ref(0);
const uploadTotal = ref(0);
const errorMessage = ref<string | null>(null);
const connectingTo = ref('');
// A transport is retrying after an unintentional drop. This is deliberately separate from
// `phase` - the SSH provisioning steps take over the whole screen, but a WebSocket reconnect
// should surface only as a small indicator next to the toolbar's location badge.
const reconnecting = ref(false);

const isVisible = computed(() => phase.value !== 'idle');
const isConnecting = computed(() => phase.value !== 'idle' && phase.value !== 'error');
const isReconnecting = computed(() => reconnecting.value);

/**
 * What a transport tells about its connection: the SSH provisioning steps and their failure,
 * and a WebSocket retrying after a drop. Only the open project's transport reports to the
 * screen-wide status; one made for the project manager (browsing a server, Open/Clone/Create)
 * gets the silent sink and shows its progress and errors inline instead.
 */
export interface IConnectionStatusSink {
	setPhase(p: ConnectionPhase): void;
	setUploadProgress(pct: number): void;
	setUploadTotal(bytes: number): void;
	setConnectingTo(target: string): void;
	setError(msg: string): void;
	setReconnecting(value: boolean): void;
	reset(): void;
}

const SILENT_CONNECTION_STATUS: IConnectionStatusSink = {
	setPhase: () => {},
	setUploadProgress: () => {},
	setUploadTotal: () => {},
	setConnectingTo: () => {},
	setError: () => {},
	setReconnecting: () => {},
	reset: () => {},
};

/** The global connection status when `report` is true, otherwise a sink that drops everything. */
export function connectionStatusSink(report: boolean): IConnectionStatusSink {
	return report ? useConnectionStatus() : SILENT_CONNECTION_STATUS;
}

export function useConnectionStatus() {
	function setPhase(p: ConnectionPhase): void {
		phase.value = p;
	}

	function setUploadProgress(pct: number): void {
		uploadProgress.value = pct;
	}

	function setUploadTotal(bytes: number): void {
		uploadTotal.value = bytes;
	}

	function setConnectingTo(target: string): void {
		connectingTo.value = target;
	}

	function setError(msg: string): void {
		errorMessage.value = msg;
		phase.value = 'error';
	}

	function setReconnecting(value: boolean): void {
		reconnecting.value = value;
	}

	function reset(): void {
		phase.value = 'idle';
		uploadProgress.value = 0;
		uploadTotal.value = 0;
		errorMessage.value = null;
		connectingTo.value = '';
		reconnecting.value = false;
	}

	return {
		phase: readonly(phase),
		uploadProgress: readonly(uploadProgress),
		uploadTotal: readonly(uploadTotal),
		errorMessage: readonly(errorMessage),
		connectingTo: readonly(connectingTo),
		reconnecting: readonly(reconnecting),
		isVisible,
		isConnecting,
		isReconnecting,
		setPhase,
		setUploadProgress,
		setUploadTotal,
		setConnectingTo,
		setError,
		setReconnecting,
		reset,
	};
}
