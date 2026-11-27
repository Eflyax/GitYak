import {beforeEach, describe, expect, it, vi} from 'vitest';

const check = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({check}));

import {createPluginInstaller} from './pluginInstaller';

function fakeUpdate(version: string, download: () => Promise<void>) {
	return {
		version,
		download: vi.fn(download),
		close: vi.fn(async () => {}),
	};
}

describe('createPluginInstaller', () => {
	beforeEach(() => {
		check.mockReset();
	});

	it('closes the update when it offers another version', async () => {
		const update = fakeUpdate('2.4.0', async () => {});
		check.mockResolvedValue(update);

		await expect(createPluginInstaller('2.3.0').download(() => {})).rejects.toThrow('instead of 2.3.0');
		expect(update.close).toHaveBeenCalledOnce();
	});

	it('closes the update and rethrows when the download fails', async () => {
		const failure = new Error('signature mismatch');
		const update = fakeUpdate('2.3.0', async () => {
			throw failure;
		});
		check.mockResolvedValue(update);

		await expect(createPluginInstaller('2.3.0').download(() => {})).rejects.toBe(failure);
		expect(update.close).toHaveBeenCalledOnce();
	});

	it('reports the download error even when closing fails too', async () => {
		const failure = new Error('network down');
		const update = fakeUpdate('2.3.0', async () => {
			throw failure;
		});
		update.close.mockRejectedValue(new Error('already closed'));
		check.mockResolvedValue(update);

		await expect(createPluginInstaller('2.3.0').download(() => {})).rejects.toBe(failure);
	});

	it('keeps the update open after a successful download, for install()', async () => {
		const update = fakeUpdate('2.3.0', async () => {});
		check.mockResolvedValue(update);

		await createPluginInstaller('2.3.0').download(() => {});
		expect(update.close).not.toHaveBeenCalled();
	});
});
