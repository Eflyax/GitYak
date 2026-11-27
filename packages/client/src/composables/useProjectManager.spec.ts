import {afterEach, describe, expect, it} from 'vitest';
import {useConnectionStatus} from '@/composables/useConnectionStatus';
import {useLayout} from '@/composables/useLayout';
import {confirmLeave, useProjectManager} from './useProjectManager';

const {setLeaveGuard, leaveManager} = useProjectManager();
const {showProjectManager} = useLayout();
const status = useConnectionStatus();

afterEach(() => {
	setLeaveGuard(null);
	status.reset();
	showProjectManager.value = false;
});

describe('confirmLeave', () => {
	it('goes ahead when nothing guards the manager', async () => {
		expect(await confirmLeave()).toBe(true);
	});

	it('asks the guard once for leaves made while it is asking', async () => {
		let asked = 0;
		let answer!: (ok: boolean) => void;
		setLeaveGuard(() => {
			asked++;

			return new Promise(r => { answer = r; });
		});

		const first = confirmLeave();
		const second = confirmLeave();
		answer(false);

		expect(await first).toBe(false);
		expect(await second).toBe(false);
		expect(asked).toBe(1);

		// A later leave asks again.
		const third = confirmLeave();
		answer(true);
		expect(await third).toBe(true);
		expect(asked).toBe(2);
	});
});

describe('leaveManager', () => {
	it('stays when the guard declines', async () => {
		showProjectManager.value = true;
		setLeaveGuard(async () => false);
		await leaveManager();
		expect(showProjectManager.value).toBe(true);
	});

	it('hides the manager and clears a stale connection error, so it is not shown over the open project', async () => {
		showProjectManager.value = true;
		status.setError('ssh: Could not resolve hostname');
		await leaveManager();
		expect(showProjectManager.value).toBe(false);
		expect(status.phase.value).toBe('idle');
	});

	it('leaves a connect in progress alone', async () => {
		showProjectManager.value = true;
		status.setPhase('uploading');
		await leaveManager();
		expect(showProjectManager.value).toBe(false);
		expect(status.phase.value).toBe('uploading');
	});
});
