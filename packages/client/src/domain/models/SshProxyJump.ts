export interface ISshProxyJumpConfig {
	/** Address of the machine that relays the connection (e.g. the VPN-connected Mac). */
	jumpHost: string;
	jumpUser: string;
	jumpPort: number | undefined;
	/** Private key used to log into the jump host; empty means ssh defaults. */
	identityFile: string;
	/** Space separated host names or ssh_config patterns routed through the jump host. */
	targetHosts: string;
}

/** Fields of the config edited through plain text inputs. */
export type TSshProxyJumpTextField = 'jumpHost' | 'jumpUser' | 'identityFile' | 'targetHosts';
