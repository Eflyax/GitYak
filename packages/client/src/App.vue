<template>
	<n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
		<n-notification-provider :placement="'bottom-left'">
			<n-message-provider>
				<n-dialog-provider>
					<AppLayout />
				</n-dialog-provider>
			</n-message-provider>
		</n-notification-provider>
	</n-config-provider>
</template>

<script setup lang="ts">
import {computed, onMounted} from 'vue';
import {darkTheme} from 'naive-ui';
import {NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider} from 'naive-ui';
import AppLayout from '@/ui/components/AppLayout.vue';
import {useTheme, restoreSavedTheme} from '@/composables/useTheme';

const {naiveUiOverrides, loadThemes} = useTheme();

const themeOverrides = computed(() => naiveUiOverrides.value);

onMounted(async () => {
	await loadThemes();
	await restoreSavedTheme();
});
</script>
