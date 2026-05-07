import {createApp} from 'vue';
import App from './App.vue';
import 'splitpanes/dist/splitpanes.css';
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css';
import './styles/global.scss';
import Icon from './ui/components/Icon.vue';
import ContextMenu from '@imengyu/vue3-context-menu';

function disableInputAssist(el: Element): void {
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
		el.spellcheck = false;
		el.setAttribute('autocorrect', 'off');
		el.setAttribute('autocomplete', 'off');
		el.setAttribute('autocapitalize', 'off');
	}
}

function applyToSubtree(root: Element): void {
	root.querySelectorAll('input, textarea').forEach(disableInputAssist);
}

const inputObserver = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const node of mutation.addedNodes) {
			if (node instanceof Element) {
				disableInputAssist(node);
				applyToSubtree(node);
			}
		}
	}
});

inputObserver.observe(document.body, {childList: true, subtree: true});

const
	app = createApp(App);

app.component('Icon', Icon);
app.use(ContextMenu);

app.mount('#app');
