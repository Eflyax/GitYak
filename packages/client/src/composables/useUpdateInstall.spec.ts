import {describe, expect, it} from 'vitest';
import type {IAvailableUpdate, TUpdateInstall} from '@/domain/services/updates';
import type {IUpdateInstaller} from '@/infrastructure/updater/IUpdateInstaller';
import {createUpdateFlow} from './useUpdateInstall';

function update(install: TUpdateInstall = {kind: 'plugin'}): IAvailableUpdate {
	return {
		version: '2.3.0',
		notes: '',
		downloadUrl: 'https://gityak.com/#download',
		releaseNotesUrl: 'https://gityak.com/changelog.html#v2.3.0',
		install,
	};
}

/** A promise settled from the test. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (err: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return {promise, resolve, reject};
}

interface IFakeInstaller extends IUpdateInstaller {
	progress: (downloaded: number, total: number | null) => void;
	finishDownload: () => void;
	failDownload: (err: unknown) => void;
	installs: number;
	answerInstall: (result: 'restarting' | 'cancelled') => void;
	failInstall: (err: unknown) => void;
}

function fakeInstaller(): IFakeInstaller {
	const download = deferred<void>();
	let install = deferred<'restarting' | 'cancelled'>();
	let onProgress: (downloaded: number, total: number | null) => void = () => {};

	const fake: IFakeInstaller = {
		installs: 0,
		download(callback) {
			onProgress = callback;

			return download.promise;
		},
		install() {
			fake.installs++;

			return install.promise;
		},
		progress: (downloaded, total) => onProgress(downloaded, total),
		finishDownload: () => download.resolve(),
		failDownload: err => download.reject(err),
		answerInstall: result => {
			install.resolve(result);
			install = deferred();
		},
		failInstall: err => install.reject(err),
	};

	return fake;
}

/** Lets pending promise callbacks run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function flowWith(installer: IUpdateInstaller, confirm: () => Promise<boolean> = () => Promise.resolve(true)) {
	let made = 0;
	const flow = createUpdateFlow(() => {
		made++;

		return installer;
	}, confirm);

	return {flow, made: () => made};
}

describe('createUpdateFlow', () => {
	it('download progress moves to ready', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		const started = flow.startUpdate(update());
		expect(flow.phase.value).toEqual({phase: 'downloading', downloaded: 0, total: null});

		installer.progress(1024, 4096);
		expect(flow.phase.value).toEqual({phase: 'downloading', downloaded: 1024, total: 4096});

		installer.finishDownload();
		await started;
		expect(flow.phase.value).toEqual({phase: 'ready'});
		expect(installer.installs).toBe(0);
	});

	it('download error -> failed with message', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		const started = flow.startUpdate(update());
		installer.failDownload(new Error('Connection reset'));
		await started;

		expect(flow.phase.value).toEqual({phase: 'failed', message: 'Connection reset'});
	});

	it('signature failure (installer throws) -> failed, never installs', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		const started = flow.startUpdate(update({kind: 'deb', url: 'https://gityak.com/releases/x.deb', signature: 'sig'}));
		installer.failDownload('The update signature does not match');
		await started;

		expect(flow.phase.value).toEqual({phase: 'failed', message: 'The update signature does not match'});

		await flow.restartToUpdate();
		expect(installer.installs).toBe(0);
		expect(flow.phase.value.phase).toBe('failed');
	});

	it('cancelled install returns to ready', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		const started = flow.startUpdate(update());
		installer.finishDownload();
		await started;

		const restarting = flow.restartToUpdate();
		await settle();
		expect(flow.phase.value).toEqual({phase: 'installing'});

		installer.answerInstall('cancelled');
		await restarting;
		expect(flow.phase.value).toEqual({phase: 'ready'});

		// The user may try again.
		const again = flow.restartToUpdate();
		await settle();
		expect(installer.installs).toBe(2);
		installer.answerInstall('restarting');
		await again;
		expect(flow.phase.value).toEqual({phase: 'installing'});
	});

	it('a failed install -> failed with message', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		const started = flow.startUpdate(update());
		installer.finishDownload();
		await started;

		const restarting = flow.restartToUpdate();
		await settle();
		installer.failInstall(new Error('pkexec failed'));
		await restarting;

		expect(flow.phase.value).toEqual({phase: 'failed', message: 'pkexec failed'});
	});

	it('restart waits for the leave guard', async () => {
		const installer = fakeInstaller();
		const answer = deferred<boolean>();
		const {flow} = flowWith(installer, () => answer.promise);

		const started = flow.startUpdate(update());
		installer.finishDownload();
		await started;

		const restarting = flow.restartToUpdate();
		await settle();
		expect(installer.installs).toBe(0);
		expect(flow.phase.value).toEqual({phase: 'ready'});

		answer.resolve(false);
		await restarting;
		expect(installer.installs).toBe(0);
		expect(flow.phase.value).toEqual({phase: 'ready'});
	});

	it('never installs before the download is ready', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		await flow.restartToUpdate();
		expect(installer.installs).toBe(0);

		void flow.startUpdate(update());
		await flow.restartToUpdate();
		expect(installer.installs).toBe(0);
		expect(flow.phase.value.phase).toBe('downloading');
	});

	it('second startUpdate while downloading is ignored', async () => {
		const installer = fakeInstaller();
		const {flow, made} = flowWith(installer);

		const first = flow.startUpdate(update());
		installer.progress(10, 100);
		await flow.startUpdate(update());

		expect(made()).toBe(1);
		expect(flow.phase.value).toEqual({phase: 'downloading', downloaded: 10, total: 100});

		installer.finishDownload();
		await first;
		expect(flow.phase.value).toEqual({phase: 'ready'});
	});

	it('kind none fails without an installer', async () => {
		const installer = fakeInstaller();
		const {flow, made} = flowWith(installer);

		await flow.startUpdate(update({kind: 'none'}));

		expect(made()).toBe(0);
		expect(flow.phase.value).toEqual({
			phase: 'failed',
			message: 'This build cannot update itself. Download the new version instead.',
		});
	});

	it('a failed update may be started again', async () => {
		const first = fakeInstaller();
		const second = fakeInstaller();
		const installers = [first, second];
		const flow = createUpdateFlow(() => installers.shift()!, () => Promise.resolve(true));

		const started = flow.startUpdate(update());
		first.failDownload(new Error('offline'));
		await started;

		const retried = flow.startUpdate(update());
		second.finishDownload();
		await retried;
		expect(flow.phase.value).toEqual({phase: 'ready'});
	});

	it('reset drops a download still running', async () => {
		const installer = fakeInstaller();
		const {flow} = flowWith(installer);

		const started = flow.startUpdate(update());
		flow.resetUpdate();
		expect(flow.phase.value).toEqual({phase: 'idle'});

		installer.progress(10, 100);
		installer.finishDownload();
		await started;
		expect(flow.phase.value).toEqual({phase: 'idle'});
	});
});
