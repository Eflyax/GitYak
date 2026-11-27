<template>
	<n-layout
		class="settings"
		has-sider
	>
		<n-layout-sider
			class="settings__sider"
			bordered
			collapse-mode="width"
			:collapsed-width="64"
			:width="200"
			:collapsed="menuCollapsed"
			show-trigger
			@collapse="menuCollapsed = true"
			@expand="menuCollapsed = false"
		>
			<n-menu
				test-id="settings-menu"
				:value="activeSection"
				:collapsed="menuCollapsed"
				:collapsed-width="64"
				:collapsed-icon-size="20"
				:icon-size="18"
				:options="menuOptions"
				@update:value="onSectionSelect"
			/>
		</n-layout-sider>

		<n-layout-content
			class="settings__content"
			:native-scrollbar="false"
			content-class="settings__content-inner"
		>
			<h3 class="settings__section-title">
				{{ activeSectionLabel }}
			</h3>

			<section
				v-if="activeSection === 'appearance'"
				test-id="settings-appearance-section"
				class="settings__section"
			>
				<div class="settings__row">
					<theme-selector />
				</div>
				<div
					v-if="isTauri"
					test-id="settings-theme-editor"
					class="settings__row"
				>
					<label class="settings__label">Colors</label>
					<div
						v-if="copyName === null"
						class="settings__buttons"
					>
						<n-button
							test-id="settings-theme-copy-btn"
							size="small"
							:disabled="isEditorOpen || !hasActiveTheme"
							@click="onCopyClick"
						>
							Copy theme
						</n-button>
						<n-button
							test-id="settings-theme-edit-btn"
							size="small"
							:disabled="isEditorOpen || !canEditActive"
							@click="onEditClick"
						>
							Edit colors
						</n-button>
					</div>
					<div
						v-else
						class="settings__buttons"
					>
						<n-input
							ref="copyNameInput"
							test-id="settings-theme-copy-name-input"
							:value="copyName"
							placeholder="Name of the new theme"
							size="small"
							@update:value="copyName = $event"
							@keydown.enter="onCopyConfirm"
							@keydown.esc.stop="copyName = null"
						/>
						<n-button
							test-id="settings-theme-copy-confirm-btn"
							size="small"
							type="primary"
							:disabled="!copyName.trim()"
							@click="onCopyConfirm"
						>
							Copy
						</n-button>
						<n-button
							size="small"
							@click="copyName = null"
						>
							Cancel
						</n-button>
					</div>
					<p class="settings__hint">
						<template v-if="isEditorOpen">
							A theme is being edited in the bar at the bottom of the window.
						</template>
						<template v-else-if="!hasActiveTheme">
							Select a theme first; its copy is what you edit.
						</template>
						<template v-else-if="canEditActive">
							Edit the colors of this theme, or copy it under a new name.
						</template>
						<template v-else>
							Built-in themes cannot be edited; copy the theme to change its colors.
						</template>
					</p>
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
			</section>

			<section
				v-else-if="activeSection === 'dates'"
				test-id="settings-dates-section"
				class="settings__section"
			>
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
				v-else-if="activeSection === 'history'"
				test-id="settings-history-section"
				class="settings__section"
			>
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
				v-else-if="activeSection === 'projects'"
				test-id="settings-projects-section"
				class="settings__section"
			>
				<div class="settings__row">
					<label class="settings__label">Recent projects shown</label>
					<n-input-number
						test-id="settings-recent-count-input"
						:value="recentCount"
						:min="1"
						:max="20"
						size="small"
						@update:value="onRecentCountInput"
					/>
					<p class="settings__hint">
						How many recently opened projects the project manager lists.
					</p>
				</div>
			</section>

			<section
				v-else-if="activeSection === 'templates'"
				test-id="settings-templates-section"
				class="settings__section"
			>
				<div class="settings__row">
					<label class="settings__label">Commit message template</label>
					<n-input
						test-id="settings-commit-template-input"
						:value="commitTemplate"
						placeholder="e.g. [IMP] "
						size="small"
						@update:value="onCommitTemplateInput"
					/>
					<p class="settings__hint">
						Every new commit summary starts with this text. Include a trailing space if the
						message should not follow it directly. A project can set its own template in its
						settings, which then replaces this one.
					</p>
				</div>
				<div class="settings__row">
					<label class="settings__label">Branch name templates</label>
					<n-dynamic-tags
						test-id="settings-branch-templates-input"
						:value="branchTemplates"
						size="small"
						@update:value="onBranchTemplatesInput"
					/>
					<p class="settings__hint">
						Prefixes such as feature/ offered when naming a branch; clicking one fills it in.
						Templates set on a project are offered before these.
					</p>
				</div>
			</section>

			<section
				v-else-if="activeSection === 'proxyJump' && isTauri"
				test-id="settings-proxy-jump-section"
				class="settings__section"
			>
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

			<section
				v-else-if="activeSection === 'about'"
				test-id="settings-about-section"
				class="settings__section"
			>
				<div class="settings__row">
					<label class="settings__label">Version</label>
					<span
						test-id="settings-app-version"
						class="settings__value"
					>GitYak {{ appVersion }}</span>
					<p class="settings__hint">
						Downloads, release notes and documentation are on
						<a
							class="settings__link"
							href="#"
							@click.prevent="openUrl(websiteUrl)"
						>gityak.com</a>.
					</p>
				</div>

				<template v-if="isTauri">
					<div class="settings__toggle">
						<n-switch
							test-id="settings-auto-update-switch"
							:value="autoCheckUpdates"
							@update:value="onAutoCheckUpdatesInput"
						/>
						<span class="settings__label">Check for updates on startup</span>
					</div>

					<div class="settings__row">
						<div class="settings__buttons">
							<n-button
								test-id="settings-check-updates-btn"
								size="small"
								:loading="updateStatus === 'checking'"
								:disabled="updateBusy"
								@click="onCheckUpdatesClick"
							>
								Check now
							</n-button>
							<!-- The install state is keyed on the phase, not the check status: a re-check must not hide it. -->
							<n-button
								v-if="updatePhase.phase === 'ready'"
								test-id="settings-restart-update-btn"
								size="small"
								type="primary"
								@click="onRestartUpdateClick"
							>
								Restart to update
							</n-button>
							<n-button
								v-else-if="updatePhase.phase === 'installing'"
								size="small"
								type="primary"
								disabled
							>
								Installing…
							</n-button>
							<template v-else-if="updatePhase.phase === 'failed'">
								<n-button
									test-id="settings-download-update-btn"
									size="small"
									@click="onDownloadUpdateClick"
								>
									Download{{ availableUpdate ? ` ${availableUpdate.version}` : '' }}
								</n-button>
								<n-button
									v-if="availableUpdate && canSelfUpdate"
									test-id="settings-retry-update-btn"
									size="small"
									type="primary"
									@click="onInstallUpdateClick"
								>
									Retry
								</n-button>
							</template>
							<template v-else-if="updatePhase.phase === 'idle' && updateStatus === 'available' && availableUpdate">
								<n-button
									v-if="canSelfUpdate"
									test-id="settings-install-update-btn"
									size="small"
									type="primary"
									@click="onInstallUpdateClick"
								>
									Update to {{ availableUpdate.version }}
								</n-button>
								<n-button
									v-else
									test-id="settings-download-update-btn"
									size="small"
									type="primary"
									@click="onDownloadUpdateClick"
								>
									Download {{ availableUpdate.version }}
								</n-button>
							</template>
							<n-button
								v-if="availableUpdate && updatePhase.phase !== 'installing'"
								size="small"
								quaternary
								@click="onReleaseNotesClick"
							>
								Release notes
							</n-button>
						</div>
						<template v-if="updatePhase.phase === 'downloading'">
							<n-progress
								test-id="settings-update-progress"
								type="line"
								:percentage="updateProgressPercent"
								:processing="updatePhase.total === null"
								:show-indicator="false"
							/>
							<p class="settings__hint">{{ updateProgressText }}</p>
						</template>
						<p
							v-else-if="updatePhase.phase === 'failed'"
							test-id="settings-update-error"
							class="settings__hint settings__hint--error"
						>
							{{ updatePhase.message }}
						</p>
						<p
							v-if="updateStatus === 'upToDate'"
							test-id="settings-update-status"
							class="settings__hint"
						>
							You are using the latest version.
						</p>
						<p
							v-else-if="updateStatus === 'available' && availableUpdate"
							test-id="settings-update-status"
							class="settings__hint"
						>
							GitYak {{ availableUpdate.version }} is available.
						</p>
						<p
							v-else-if="updateStatus === 'error'"
							test-id="settings-update-status"
							class="settings__hint settings__hint--error"
						>
							Cannot check for updates: {{ updateError }}
						</p>
					</div>
				</template>
			</section>
		</n-layout-content>
	</n-layout>
</template>
<script src="./Settings.ts" lang="ts" />
<style src="./Settings.scss" lang="scss" scoped />
