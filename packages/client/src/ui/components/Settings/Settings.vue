<template>
	<div class="settings">
		<section class="settings__section">
			<h3 class="settings__section-title">Appearance</h3>
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
			</div>
		</section>
	</div>
</template>
<script src="./Settings.ts" lang="ts" />
<style src="./Settings.scss" lang="scss" scoped />
