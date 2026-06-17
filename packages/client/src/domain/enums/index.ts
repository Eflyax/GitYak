export enum EReferenceType {
	Branch = 'branch',
	RemoteBranch = 'remote',
	Tag = 'tag',
	Stash = 'stash',
	Head = 'HEAD',
}

export enum EFileStatus {
	Added = 'A',
	Modified = 'M',
	Deleted = 'D',
	Renamed = 'R',
	Conflicted = 'C',
	Untracked = '?',
	Unmodified = ' ',
	UpdatedUnmerged = 'U',
}

export enum EFileArea {
	Staged = 'staged',
	Unstaged = 'unstaged',
	Committed = 'committed',
}

export enum ENetworkCommand {
	GitCall = 'gitCall',
	WriteFile = 'writeFile',
	ReadFile = 'readFile',
	BrowseFiles = 'browseFiles',
	SshAgentInit = 'sshAgentInit',
	Heartbeat = 'heartbeat',
}

export enum EGitErrorCode {
	NotARepository = 'notARepository',
	AuthenticationFailed = 'authenticationFailed',
	MergeConflict = 'mergeConflict',
	StashConflict = 'stashConflict',
	CherryPickConflict = 'cherryPickConflict',
	PushRejected = 'pushRejected',
	BranchNotFound = 'branchNotFound',
	CommitNotFound = 'commitNotFound',
	UncommittedChanges = 'uncommittedChanges',
	PermissionDenied = 'permissionDenied',
	NetworkError = 'networkError',
	Unknown = 'unknown',
}

export enum EConnectionStatus {
	Idle = 'idle',
	Connecting = 'connecting',
	Connected = 'connected',
	Disconnected = 'disconnected',
}

export enum EReferenceModalType {
	Branch = 'branch',
	Tag = 'tag',
	Stash = 'stash',
}

export enum EServerType {
	Bun = 'bun',
	SSH = 'ssh',
}
