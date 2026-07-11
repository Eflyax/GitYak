import {h} from 'vue';
import {useNotification} from 'naive-ui';

type ENotifyType = 'success' | 'error' | 'warning' | 'info';

// Wraps naive-ui's notification API so every toast carries a `gy-notify--<type>`
// marker element. Global CSS (`.n-notification:has(.gy-notify--…)`) colours the
// card by type. Keeps call sites terse: `notify.success('Pushed')`.
export function useNotify() {
	const notification = useNotification();

	function make(type: ENotifyType, content: string, duration: number) {
		return notification[type]({
			content: () => h('span', {class: `gy-notify gy-notify--${type}`}, content),
			duration,
		});
	}

	return {
		success: (content: string, duration = 3000) => make('success', content, duration),
		error: (content: string, duration = 5000) => make('error', content, duration),
		warning: (content: string, duration = 4000) => make('warning', content, duration),
		info: (content: string, duration = 3000) => make('info', content, duration),
	};
}
