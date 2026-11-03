import {ref, watch} from 'vue';
import {DEFAULT_DATE_FORMAT, formatGitDate, isDateFormat} from '@/domain/services/dateFormat';
import type {TDateFormat} from '@/domain/services/dateFormat';

const STORAGE_KEY = 'git-yak:dateFormat';

function read(): TDateFormat {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);

		return isDateFormat(stored) ? stored : DEFAULT_DATE_FORMAT;
	}
	catch {
		return DEFAULT_DATE_FORMAT;
	}
}

const dateFormat = ref<TDateFormat>(read());

watch(dateFormat, value => {
	try {
		localStorage.setItem(STORAGE_KEY, value);
	}
	catch {
		console.error('localStorage is not available');
	}
});

/** Display format of commit dates, chosen in Settings and shared by every view. */
export function useDateFormat() {
	function formatDate(raw: string): string {
		return formatGitDate(raw, dateFormat.value);
	}

	return {dateFormat, formatDate};
}
