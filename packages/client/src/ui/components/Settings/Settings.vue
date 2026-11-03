<template>
	<div class="settings">
		<section class="settings__section">
			<h3 class="settings__section-title">
				Appearance
			</h3>
			<div class="settings__row">
				<theme-selector />
			</div>
			<div class="settings__row">
				<label class="settings__label">Themes directory</label>
				<n-input
					:value="themesDir"
					placeholder="Path to themes directory"
					size="small"
					@update:value="onThemesDirInput"
					@blur="onThemesDirBlur"
				/>
				<p class="settings__hint">
					Optional. *.jsonc themes from this directory are added to the built-in ones
					({{ customThemesCount }} loaded).
				</p>
			</div>
			<div class="settings__row">
				<label class="settings__label">Date format</label>
				<n-select
					test-id="settings-date-format-select"
					:value="dateFormat"
					:options="dateFormatOptions"
					size="small"
					@update:value="onDateFormatInput"
				/>
				<p class="settings__hint">
					How commit dates are shown in the history, commit details and file history.
				</p>
			</div>
		</section>

		<section
			test-id="settings-history-section"
			class="settings__section"
		>
			<h3 class="settings__section-title">
				History
			</h3>
			<div class="settings__row">
				<label class="settings__label">Commits per page</label>
				<n-input-number
					test-id="settings-history-page-size-input"
					:value="historyPageSize"
					:min="pageSizeMin"
					:max="pageSizeMax"
					:step="100"
					size="small"
					@update:value="onPageSizeInput"
				/>
				<p class="settings__hint">
					Loaded when a repository opens, and again each time the history is scrolled to its end.
				</p>
			</div>
			<div class="settings__row">
				<label class="settings__label">Maximum commits</label>
				<n-input-number
					test-id="settings-history-max-commits-input"
					:value="historyMaxCommits"
					:min="0"
					:step="1000"
					size="small"
					@update:value="onMaxCommitsInput"
				/>
				<p class="settings__hint">
					The history stops loading older commits past this count. 0 means no limit.
				</p>
			</div>
		</section>

		<section
			v-if="isTauri"
			test-id="settings-proxy-jump-section"
			class="settings__section"
		>
			<h3 class="settings__section-title">
				SSH ProxyJump
			</h3>
			<div class="settings__toggle">
				<n-switch
					test-id="settings-proxy-jump-switch"
					:value="proxyJumpEnabled"
					:loading="proxyJumpBusy"
					@update:value="onProxyJumpToggle"
				/>
				<span class="settings__label">
					{{ proxyJumpEnabled ? 'Enabled' : 'Disabled' }}
				</span>
			</div>
			<p class="settings__hint">
				Routes SSH connections to the git server through another machine (e.g. one connected
				to a VPN). GitYak adds or removes its own block in ~/.ssh/config. While enabled, git
				fails when the jump host is unreachable; it never falls back to a direct connection.
			</p>
			<div class="settings__row">
				<label class="settings__label">Git server host</label>
				<n-input
					test-id="settings-proxy-jump-target-input"
					:value="proxyJump.targetHosts"
					placeholder="git.example.com"
					size="small"
					@update:value="onProxyJumpInput('targetHosts', $event)"
					@blur="onProxyJumpBlur"
				/>
				<p class="settings__hint">
					Host from the remote URL. Separate several hosts with spaces.
				</p>
			</div>
			<div class="settings__row">
				<label class="settings__label">Jump host</label>
				<n-input
					test-id="settings-proxy-jump-host-input"
					:value="proxyJump.jumpHost"
					placeholder="10.99.0.1"
					size="small"
					@update:value="onProxyJumpInput('jumpHost', $event)"
					@blur="onProxyJumpBlur"
				/>
			</div>
			<div class="settings__row">
				<label class="settings__label">Jump user</label>
				<n-input
					test-id="settings-proxy-jump-user-input"
					:value="proxyJump.jumpUser"
					placeholder="Optional, defaults to the current user"
					size="small"
					@update:value="onProxyJumpInput('jumpUser', $event)"
					@blur="onProxyJumpBlur"
				/>
			</div>
			<div class="settings__row">
				<label class="settings__label">Jump port</label>
				<n-input-number
					test-id="settings-proxy-jump-port-input"
					:value="proxyJump.jumpPort"
					:min="1"
					:max="65535"
					:show-button="false"
					placeholder="22"
					size="small"
					@update:value="onProxyJumpPortInput"
					@blur="onProxyJumpBlur"
				/>
			</div>
			<div class="settings__row">
				<label class="settings__label">Identity file</label>
				<n-auto-complete
					test-id="settings-proxy-jump-key-input"
					:value="proxyJump.identityFile"
					:options="identityFileOptions"
					:get-show="showIdentityFileOptions"
					placeholder="Optional, e.g. ~/.ssh/id_ed25519"
					size="small"
					@update:value="onProxyJumpInput('identityFile', $event)"
					@select="onProxyJumpBlur"
					@blur="onProxyJumpBlur"
				/>
			</div>
		</section>
	</div>
</template>
<script src="./Settings.ts" lang="ts" />
<style src="./Settings.scss" lang="scss" scoped />
