<template>
	<svg
		class="fill-current"
		viewBox="0 0 24 24"
	>
		<path :d="iconPath" />
	</svg>
</template>

<script lang="ts">
import {defineComponent, computed} from 'vue';
import * as icons from '@mdi/js';

function toMdiKey(name: string): string {
	return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default defineComponent({
	props: {
		name: {type: String, required: true},
	},
	setup(props) {
		const iconPath = computed(
			() => (icons as Record<string, string>)[toMdiKey(props.name)] ?? '',
		);

		return {iconPath};
	},
});
</script>
