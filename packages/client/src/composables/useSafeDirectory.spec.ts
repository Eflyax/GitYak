import {describe, it, expect, beforeEach} from 'vitest';
import {useSafeDirectory} from './useSafeDirectory';

const PATH = '/var/www/html/foo';

beforeEach(() => {
	useSafeDirectory().dismiss();
});

describe('useSafeDirectory', () => {
	it('starts closed', () => {
		const {show, path} = useSafeDirectory();

		expect(show.value).toBe(false);
		expect(path.value).toBeNull();
	});

	it('opens for the directory git refused', () => {
		const {request, show, path} = useSafeDirectory();

		request(PATH);

		expect(show.value).toBe(true);
		expect(path.value).toBe(PATH);
	});

	// One refresh fires several git commands in parallel and every one of them fails with the
	// same refusal; without this the user would be asked once per command.
	it('ignores repeated requests while the prompt is already open', () => {
		const {request, path} = useSafeDirectory();

		request(PATH);
		request('/some/other/repo');

		expect(path.value).toBe(PATH);
	});

	it('closes and forgets the path when dismissed', () => {
		const {request, dismiss, show, path} = useSafeDirectory();

		request(PATH);
		dismiss();

		expect(show.value).toBe(false);
		expect(path.value).toBeNull();
	});

	// Declining does not fix the repository, so the next operation that hits the same refusal
	// is allowed to ask again.
	it('asks again after the user dismissed it', () => {
		const {request, dismiss, show} = useSafeDirectory();

		request(PATH);
		dismiss();
		request(PATH);

		expect(show.value).toBe(true);
	});

	it('is shared state, not per-caller state', () => {
		useSafeDirectory().request(PATH);

		expect(useSafeDirectory().show.value).toBe(true);
	});
});
