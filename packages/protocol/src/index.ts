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
	command: string;
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

export function isErrorResponse(value: IWsResponse): value is IWsErrorResponse {
	return value.status === 'error';
}
