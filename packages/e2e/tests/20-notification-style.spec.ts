import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import {createBareRemote} from '../fixtures/repo';

// Computed colours come back either as `rgb(r, g, b)` / `rgba(r, g, b, a)` or, once
// color-mix() is involved, as `color(srgb r g b)` / `color(srgb r g b / a)`. Only the forms
// that state a fourth component can be anything but opaque.
function alphaOf(color: string): number {
	const slash = /\/\s*([\d.]+)\s*\)$/.exec(color);

	if (slash) {
		return Number(slash[1]);
	}

	const rgba = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(color.trim());

	return rgba ? Number(rgba[1]) : 1;
}

// A toast has to be readable over whatever it covers. It used to be fully transparent
// because its background was written as rgba(var(--color, #hex), .1), which is not valid
// CSS — the browser dropped the declaration and left the card see-through.
test('a notification is drawn on an opaque background', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin ${remote.path}`);
		repo.run('push -u origin master');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'toolbar-fetch-btn').click();

		const toast = page.locator('.n-notification').filter({has: page.locator('.gy-notify--success')});

		await expect(toast).toBeVisible({timeout: 15_000});

		const background = await toast.evaluate(el => getComputedStyle(el).backgroundColor);

		expect(alphaOf(background)).toBe(1);
		expect(background).not.toBe('rgba(0, 0, 0, 0)');

		// The type is still legible from the accent border.
		const borderColor = await toast.evaluate(el => getComputedStyle(el).borderLeftColor);

		expect(alphaOf(borderColor)).toBe(1);
		expect(borderColor).not.toBe('rgba(0, 0, 0, 0)');
	}
	finally {
		remote.cleanup();
	}
});
