<template>
	<n-modal
		:show="paletteOpen"
		:mask-closable="true"
		:show-icon="false"
		class="command-palette-modal"
		@update:show="onModalUpdate"
	>
		<div
			class="command-palette"
			test-id="command-palette"
		>
			<n-input
				ref="inputRef"
				:value="query"
				:placeholder="inputPlaceholder"
				size="large"
				test-id="command-palette-input"
				@update:value="onQueryUpdate"
				@keydown="onKeydown"
			/>
			<div
				class="command-palette__list"
				test-id="command-palette-list"
			>
				<template v-if="activeCommand">
					<div
						v-for="(item, i) in subItems"
						:key="item.id"
						class="command-palette__item"
						:class="{'command-palette__item--active': i === activeIndex}"
						:test-id="'command-palette-subitem-' + item.id"
						@click="onSubItemClick(item)"
						@mousemove="onItemHover(i)"
					>
						<span
							v-if="item.color"
							class="command-palette__dot"
							:style="{background: item.color}"
						/>
						<span class="command-palette__text">
							<span class="command-palette__label">{{ item.label }}</span>
							<span
								v-if="item.description"
								class="command-palette__description"
								:title="item.description"
							>{{ item.description }}</span>
						</span>
						<span
							v-if="item.hint"
							class="command-palette__hint"
						>
							<Icon
								v-if="item.hintIcon"
								:name="item.hintIcon"
							/>
							{{ item.hint }}
						</span>
					</div>
					<div
						v-if="!subItems.length"
						class="command-palette__empty"
					>
						No results found
					</div>
				</template>
				<template v-else>
					<div
						v-for="(cmd, i) in filteredCommands"
						:key="cmd.id"
						class="command-palette__item"
						:class="{
							'command-palette__item--active': i === activeIndex,
							'command-palette__item--disabled': !isCommandEnabled(cmd),
						}"
						:test-id="'command-palette-item-' + cmd.id"
						@click="onItemClick(cmd)"
						@mousemove="onItemHover(i)"
					>
						<span class="command-palette__label">{{ cmd.label }}</span>
						<span
							v-if="cmd.shortcut"
							class="command-palette__shortcut"
						>{{ cmd.shortcut }}</span>
					</div>
					<div
						v-if="!filteredCommands.length"
						class="command-palette__empty"
					>
						No commands found
					</div>
				</template>
			</div>
		</div>
	</n-modal>
</template>
<script src="./CommandPalette.ts" lang="ts" />
<style src="./CommandPalette.scss" lang="scss" scoped />
