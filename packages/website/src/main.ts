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

init();
