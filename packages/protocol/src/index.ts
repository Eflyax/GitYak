export enum ENetworkCommand {
	GitCall = 'gitCall',
	WriteFile = 'writeFile',
	ReadFile = 'readFile',
	BrowseFiles = 'browseFiles',
	SshAgentInit = 'sshAgentInit',
	Heartbeat = 'heartbeat',
}

export interface IWsRequest {
	requestId: string;
	command: ENetworkCommand;
	[key: string]: unknown;
}

export interface IWsSuccessResponse {
	requestId: string;
	status: 'success';
	data?: unknown;
}

export interface IWsErrorResponse {
	requestId?: string;
	status: 'error';
	message: string;
	details?: string;
}

export type IWsResponse = IWsSuccessResponse | IWsErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isErrorResponse(value: unknown): value is IWsErrorResponse {
	return isRecord(value)
		&& value['status'] === 'error'
		&& typeof value['message'] === 'string';
}

export function isSuccessResponse(value: unknown): value is IWsSuccessResponse {
	return isRecord(value)
		&& value['status'] === 'success'
		&& typeof value['requestId'] === 'string';
}

export interface IWsAuthRequest {
	type: 'auth';
	token: string;
}

export interface IWsEvent {
	type: 'event';
	event: 'repoChanged';
	paths: Array<string>;
}

export function isAuthRequest(value: unknown): value is IWsAuthRequest {
	return isRecord(value)
		&& value['type'] === 'auth'
		&& typeof value['token'] === 'string';
}

export function isRepoChangedEvent(value: unknown): value is IWsEvent {
	return isRecord(value)
		&& value['type'] === 'event'
		&& value['event'] === 'repoChanged'
		&& Array.isArray(value['paths']);
}
