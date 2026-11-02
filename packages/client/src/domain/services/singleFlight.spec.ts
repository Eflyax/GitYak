import {describe, it, expect} from 'vitest';
import {singleFlight} from './singleFlight';

function deferred(): {promise: Promise<void>, resolve: () => void, reject: (e: Error) => void} {
	let
		resolve!: () => void,
		reject!: (e: Error) => void;

	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return {promise, resolve, reject};
}

describe('singleFlight', () => {
	it('runs once when nothing else is in flight', async () => {
		let runs = 0;
		const load = singleFlight(async () => {
			runs++;
		});

		await load();

		expect(runs).toBe(1);
	});

	it('never overlaps runs and folds calls made during a run into one follow-up', async () => {
		const gates: Array<ReturnType<typeof deferred>> = [];
		let active = 0, maxActive = 0, runs = 0;

		const load = singleFlight(async () => {
			runs++;
			active++;
			maxActive = Math.max(maxActive, active);

			const gate = deferred();

			gates.push(gate);
			await gate.promise;
			active--;
		});

		const first = load();
		const second = load();
		const third = load();

		expect(second).toBe(third);

		gates[0]!.resolve();
		await first;
		await Promise.resolve();
		gates[1]!.resolve();
		await second;

		expect(runs).toBe(2);
		expect(maxActive).toBe(1);
	});

	it('still runs the follow-up when the current run fails', async () => {
		let runs = 0;
		const gate = deferred();

		const load = singleFlight(async () => {
			runs++;

			if (runs === 1) await gate.promise;
		});

		const first = load();
		const second = load();

		gate.reject(new Error('boom'));

		await expect(first).rejects.toThrow('boom');
		await second;

		expect(runs).toBe(2);
	});
});
