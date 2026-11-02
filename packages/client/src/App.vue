<template>
	<n-config-provider
		:theme="darkTheme"
		:theme-overrides="themeOverrides"
	>
		<n-notification-provider
			:placement="'bottom-left'"
			:container-style="notificationContainerStyle"
		>
			<n-message-provider>
				<n-dialog-provider>
					<AppLayout />
				</n-dialog-provider>
			</n-message-provider>
		</n-notification-provider>
		<BackgroundTasksIndicator />
	</n-config-provider>
</template>

<script setup lang="ts">
import {computed, onMounted} from 'vue';
import {darkTheme} from 'naive-ui';
import {NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider} from 'naive-ui';
import AppLayout from '@/ui/components/AppLayout.vue';
import BackgroundTasksIndicator from '@/ui/components/BackgroundTasksIndicator.vue';
import {useTheme, restoreSavedTheme} from '@/composables/useTheme';
import {useBackgroundTasks} from '@/composables/useBackgroundTasks';

const {naiveUiOverrides, loadThemes} = useTheme();
const {isBusy} = useBackgroundTasks();

const themeOverrides = computed(() => naiveUiOverrides.value);

// Lifts the notification stack above the background-task indicator (12px from the bottom,
// 36px tall); the container's own 12px padding keeps the usual gap between the two.
const notificationContainerStyle = computed(() => (isBusy.value ? {bottom: '48px'} : {}));

onMounted(async () => {
	await loadThemes();
	await restoreSavedTheme();
});
</script>
