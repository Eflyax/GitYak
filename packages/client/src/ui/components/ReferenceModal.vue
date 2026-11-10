<template>
	<NModal
		v-model:show="showModel"
		preset="card"
		:title="title"
		style="width: 420px;"
		:mask-closable="false"
		@after-enter="inputRef?.focus()"
	>
		<NInput
			ref="inputRef"
			v-model:value="name"
			test-id="reference-name-input"
			:placeholder="placeholder"
			@keydown.enter="confirm"
		/>

		<div
			v-if="templates.length"
			test-id="branch-templates"
			class="templates"
		>
			<NButton
				v-for="template in templates"
				:key="template"
				test-id="branch-template-btn"
				size="tiny"
				secondary
				@click="applyTemplate(template)"
			>
				{{ template }}
			</NButton>
		</div>

		<template #footer>
			<div class="modal-footer">
				<NButton
					test-id="reference-modal-cancel-btn"
					@click="cancel"
				>
					Cancel
				</NButton>
				<NButton
					test-id="reference-modal-confirm-btn"
					type="primary"
					:disabled="!name.trim() || submitting"
					:loading="submitting"
					@click="confirm"
				>
					Confirm
				</NButton>
			</div>
		</template>
	</NModal>
</template>

<script setup lang="ts">
import {ref, computed, watch, nextTick} from 'vue';
import {NModal, NInput, NButton, useMessage} from 'naive-ui';
import {useBranches} from '@/composables/useBranches';
import {useTags} from '@/composables/useTags';
import {useStash} from '@/composables/useStash';
import {useTemplates} from '@/composables/useTemplates';
import {EReferenceModalType} from '@/domain';
import {applyBranchTemplate} from '@/domain/services/templates';

const props = defineProps<{
	show: boolean;
	type: EReferenceModalType;
	mode: 'create' | 'rename';
	commitHash?: string;
	initialName?: string;
	stashId?: string;
}>();

const emit = defineEmits<{
	'update:show': [value: boolean];
	'done': [];
}>();

const message = useMessage();
const {createBranch, renameBranch} = useBranches();
const {createTag} = useTags();
const {renameStash} = useStash();
const {branchTemplates} = useTemplates();

const name = ref('');
const submitting = ref(false);
const inputRef = ref<InstanceType<typeof NInput> | null>(null);

const showModel = computed({
	get: () => props.show,
	set: (val) => emit('update:show', val),
});

const title = computed(() => {
	if (props.mode === 'rename') {
		if (props.type === EReferenceModalType.Branch) return 'Rename Branch';
		if (props.type === EReferenceModalType.Tag) return 'Rename Tag';
		if (props.type === EReferenceModalType.Stash) return 'Rename Stash';
	}
	if (props.type === EReferenceModalType.Branch) return 'New Branch';
	if (props.type === EReferenceModalType.Tag) return 'New Tag';
	return 'New Stash';
});

const placeholder = computed(() => {
	if (props.type === EReferenceModalType.Branch) return 'Branch name';
	if (props.type === EReferenceModalType.Tag) return 'Tag name';
	return 'Stash name';
});

const templates = computed(() => (props.type === EReferenceModalType.Branch ? branchTemplates.value : []));

// The template goes in front of the name (replacing another template already there), and
// the caret lands at the end so typing continues right after it.
async function applyTemplate(template: string): Promise<void> {
	name.value = applyBranchTemplate(name.value, template, templates.value);
	await nextTick();
	inputRef.value?.focus();

	const input = inputRef.value?.inputElRef;

	input?.setSelectionRange(input.value.length, input.value.length);
}

watch(() => props.show, (val) => {
	if (val) {
		name.value = props.initialName ?? '';
	}
});

function cancel(): void {
	emit('update:show', false);
}

async function confirm(): Promise<void> {
	const trimmed = name.value.trim();
	if (!trimmed || submitting.value) return;

	submitting.value = true;

	try {
		if (props.type === EReferenceModalType.Stash && props.mode === 'rename') {
			const id = props.stashId;
			const hash = props.commitHash;
			if (id && hash) {
				await renameStash(id, hash, trimmed);
			}
		}
		else if (props.mode === 'create') {
			if (props.type === EReferenceModalType.Branch) {
				const hash = props.commitHash && props.commitHash !== 'WORKING_TREE'
					? props.commitHash
					: undefined;
				await createBranch(trimmed, hash);
			}
			else if (props.type === EReferenceModalType.Tag) {
				const hash = props.commitHash && props.commitHash !== 'WORKING_TREE'
					? props.commitHash
					: undefined;
				await createTag(trimmed, hash);
			}
		}
		else if (props.mode === 'rename') {
			const oldName = props.initialName ?? '';

			// Unchanged name: nothing to do (git would reject it as "already exists").
			if (props.type === EReferenceModalType.Branch && oldName && trimmed !== oldName) {
				await renameBranch(oldName, trimmed);
				message.success(`Branch ${oldName} renamed to ${trimmed}`);
			}
		}

		emit('done');
		emit('update:show', false);
		name.value = '';
	}
	catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		message.error(msg);
	}
	finally {
		submitting.value = false;
	}
}
</script>

<style scoped>
.templates {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 10px;
}

.modal-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
