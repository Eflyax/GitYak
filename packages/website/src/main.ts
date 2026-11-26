import './styles/main.scss';
import {RELEASE_PLATFORMS} from '@git-yak/protocol';
import type {IRelease, IReleaseAsset} from '@git-yak/protocol';
import {detectOs, suggestedPlatforms} from './platform';
import {el, fetchLatestRelease, formatDate, formatSize} from './releases';

function platformInfo(asset: IReleaseAsset) {
	return RELEASE_PLATFORMS.find(p => p.platform === asset.platform);
}

function downloadButton(asset: IReleaseAsset, primary: boolean): HTMLAnchorElement {
	const info = platformInfo(asset);

	return el('a', {class: `download-card${primary ? ' download-card--primary' : ''}`, href: asset.url, download: ''},
		el('span', {class: 'download-card__label'}, `Download for ${info?.label ?? asset.platform}`),
		el('span', {class: 'download-card__detail'}, `${info?.detail ?? ''} · ${formatSize(asset.size)}${info?.beta ? ' · beta' : ''}`),
	);
}

function renderSuggested(release: IRelease): void {
	const container = document.getElementById('download-suggested');
	const suggested = suggestedPlatforms(detectOs(navigator.userAgent))
		.map(platform => release.assets.find(asset => asset.platform === platform))
		.filter((asset): asset is IReleaseAsset => asset !== undefined);

	container?.replaceChildren(...suggested.map((asset, index) => downloadButton(asset, index === 0)));

	// The hero's Download button goes straight to the best guess.
	const heroButton = document.querySelector<HTMLAnchorElement>('#hero-download .button--primary');

	if (heroButton && suggested[0]) {
		heroButton.href = suggested[0].url;
		heroButton.setAttribute('download', '');
		heroButton.textContent = `Download for ${platformInfo(suggested[0])?.label ?? 'your system'}`;
	}
}

function renderTable(release: IRelease): void {
	const table = document.getElementById('download-table') as HTMLTableElement | null;

	if (!table) {
		return;
	}

	const rows = RELEASE_PLATFORMS.flatMap(info => {
		const asset = release.assets.find(a => a.platform === info.platform);

		if (!asset) {
			return [];
		}

		return [el('tr', {},
			el('td', {}, info.label, ' ', el('span', {class: 'muted'}, info.detail), ...(info.beta ? [' ', el('span', {class: 'badge'}, 'beta')] : [])),
			el('td', {}, el('a', {href: asset.url, download: ''}, asset.file)),
			el('td', {class: 'nowrap'}, formatSize(asset.size)),
			el('td', {}, el('code', {class: 'hash', title: asset.sha256}, asset.sha256)),
		)];
	});

	table.tBodies[0].replaceChildren(...rows);
	table.hidden = false;
}

async function init(): Promise<void> {
	const lead = document.getElementById('download-lead');

	try {
		const release = await fetchLatestRelease();
		const date = formatDate(release.date);

		lead?.replaceChildren(
			`GitYak ${release.version}${date ? `, released ${date}` : ''}. `,
			el('a', {href: `/changelog.html#${release.tag}`}, 'What\'s new'),
		);
		document.getElementById('hero-version')?.replaceChildren(`Version ${release.version} · Free and open source · macOS · Windows · Linux`);

		renderSuggested(release);
		renderTable(release);
	}
	catch {
		lead?.replaceChildren(
			'No release is published yet. Meanwhile you can build GitYak from ',
			el('a', {href: 'https://github.com/Eflyax/GitYak', rel: 'noopener'}, 'source'),
			'.',
		);
	}
}


/**
 * The theme picker in #themes: each button shows the same history in that theme. The screenshots
 * (packages/e2e/screenshots) are fetched on hover or focus, so only the ones looked at are loaded.
 */
function initThemePicker(): void {
	const
		shot = document.getElementById('theme-shot') as HTMLImageElement | null,
		buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-shot]')),
		srcOf = (button: HTMLButtonElement): string => `/screenshots/themes/${button.dataset.themeShot}.png`,
		preload = (button: HTMLButtonElement): void => {
			new Image().src = srcOf(button);
		};

	if (!shot) {
		return;
	}

	const pick = (button: HTMLButtonElement): void => {
		for (const other of buttons) {
			other.setAttribute('aria-checked', String(other === button));
			other.tabIndex = other === button ? 0 : -1;
		}

		shot.src = srcOf(button);
		shot.alt = `GitYak's commit history in the ${button.textContent?.trim() ?? ''} theme`;
	};

	buttons.forEach((button, index) => {
		button.tabIndex = button.getAttribute('aria-checked') === 'true' ? 0 : -1;
		button.addEventListener('pointerenter', () => preload(button), {once: true});
		button.addEventListener('focus', () => preload(button), {once: true});
		button.addEventListener('click', () => pick(button));
		// a radio group: the arrow keys move the choice
		button.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];

			if (!step) {
				return;
			}

			event.preventDefault();

			const next = buttons[(index + step + buttons.length) % buttons.length];

			pick(next);
			next.focus();
		});
	});
}

init();
initThemePicker();
