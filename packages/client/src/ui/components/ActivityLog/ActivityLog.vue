<template>
	<div class="activity-log">
		<div class="activity-log__header">
			<span class="activity-log__title">Activity Log <span class="activity-log__count">({{ logs.length }})</span></span>
			<NButton
				size="tiny"
				secondary
				@click="clearLogs"
			>
				Clear
			</NButton>
		</div>
		<NDataTable
			:data="[...logs]"
			:columns="columns"
			size="small"
			:row-key="(row) => row.id"
			virtual-scroll
			:max-height="'calc(100vh - 100px)'"
			class="activity-log__table"
		/>
	</div>
</template>

<script setup lang="ts">
import {h} from 'vue';
import {NDataTable, NButton} from 'naive-ui';
import type {DataTableColumns} from 'naive-ui';
import {useActivityLog} from '@/composables/useActivityLog';
import type {IActivityLog} from '@/domain';

const {logs, clearLogs} = useActivityLog();

function statusColor(status: IActivityLog['status']): string {
	if (status === 'success') return '#4ade80';
	if (status === 'error') return '#f87171';
	return '#9ca3af';
}

const columns: DataTableColumns<IActivityLog> = [
	{key: 'time', title: 'Time', width: 75},
	{
		key: 'direction',
		title: '',
		width: 24,
		render: (row) => row.direction === 'request' ? '→' : '←',
	},
	{key: 'type', title: 'Type', width: 42},
	{
		key: 'status',
		title: 'Status',
		width: 74,
		render: (row) => h('span', {style: {color: statusColor(row.status)}}, row.status),
	},
	{key: 'message', title: 'Message', ellipsis: {tooltip: true}},
];
</script>

<style scoped lang="scss">
.activity-log {
	display: flex;
	flex-direction: column;
	height: 100%;

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid $border;
		flex-shrink: 0;
	}

	&__title {
		font-size: 13px;
		font-weight: 600;
		color: $text-primary;
	}

	&__count {
		color: $text-muted;
		font-weight: 400;
	}

	&__table {
		flex: 1;
		min-height: 0;
	}
}
</style>
