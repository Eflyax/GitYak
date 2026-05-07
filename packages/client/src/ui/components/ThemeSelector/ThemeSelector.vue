<template>
	<div
		class="theme-selector"
		test-id="theme-selector"
	>
		<label class="theme-selector__label">Theme</label>
		<n-select
			:value="selectedPath"
			:options="options"
			placeholder="Select theme"
			:input-props="{
				'aria-label': 'Theme selector',
				'role': 'listbox',
			}"
			@update:value="onSelect"
		/>
		<p
			v-if="!options.length"
			class="theme-selector__empty"
		>
			No themes found in themes directory
		</p>
	</div>
</template>
<script src="./ThemeSelector.ts" lang="ts" />
<style src="./ThemeSelector.scss" lang="scss" scoped />
