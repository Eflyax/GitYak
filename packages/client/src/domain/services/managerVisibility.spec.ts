import {describe, expect, it} from 'vitest';
import {isManagerVisible} from './managerVisibility';
import type {IManagerVisibilityState} from './managerVisibility';

const base: IManagerVisibilityState = {statusVisible: false, requested: false, opening: false, hasOpenProject: true};

describe('isManagerVisible', () => {
	it('hides the manager over an open project unless asked for', () => {
		expect(isManagerVisible(base)).toBe(false);
		expect(isManagerVisible({...base, requested: true})).toBe(true);
	});

	it('shows the manager when no project is open', () => {
		expect(isManagerVisible({...base, hasOpenProject: false})).toBe(true);
	});

	it('keeps the manager up while a connect without visible progress is in flight', () => {
		expect(isManagerVisible({...base, opening: true})).toBe(true);
	});

	it('gives the screen to the connection progress of an open in flight', () => {
		expect(isManagerVisible({...base, statusVisible: true, opening: true})).toBe(false);
		expect(isManagerVisible({...base, statusVisible: true, opening: true, hasOpenProject: false})).toBe(false);
	});

	it('shows a connection error rather than the manager, until the manager is asked for', () => {
		expect(isManagerVisible({...base, statusVisible: true, hasOpenProject: false})).toBe(false);
		expect(isManagerVisible({...base, statusVisible: true, hasOpenProject: false, requested: true})).toBe(true);
	});
});
