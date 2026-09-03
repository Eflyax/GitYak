import type {EServerType} from '../enums';

export interface IProject {
	id: string
	order: number
	alias: string
	path: string
	server: string
	port: number
	dateCreated: number
	dateLastOpen: number
	serverType: EServerType
	sshUser?: string
	sshKeyPath?: string
	sshPrivateKey?: string
	color?: string
	groupId?: string
	token?: string
}

export interface IProjectGroup {
	id: string
	name: string
	color?: string
}
