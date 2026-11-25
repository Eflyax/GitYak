import './styles/main.scss';
import {RELEASE_PLATFORMS} from '@git-yak/protocol';
import type {IRelease} from '@git-yak/protocol';
import {renderMarkdown} from './markdown';
import {el, fetchReleaseIndex, formatDate} from './releases';

function renderRelease(release: IRelease): HTMLElement {
	const notes = el('div', {class: 'release__notes'});

	// renderMarkdown escapes the notes before adding its own tags.
	notes.innerHTML = renderMarkdown(release.notes || 'No release notes.');

	const downloads = release.assets.length
		? el('p', {class: 'release__downloads'}, 'Download: ', ...release.assets.flatMap((asset, index) => [
			...(index ? [' · '] : []),
			el('a', {href: asset.url, download: ''}, RELEASE_PLATFORMS.find(p => p.platform === asset.platform)?.label ?? asset.platform),
		]))
		: el('p', {class: 'release__downloads muted'}, 'Installers of this version are no longer hosted.');

	return el('article', {class: 'release', id: release.tag},
		el('h2', {class: 'release__title'},
			el('a', {href: `#${release.tag}`}, release.version),
			...(release.version.includes('-') ? [' ', el('span', {class: 'badge'}, 'pre-release')] : []),
		),
		el('p', {class: 'release__date muted'}, formatDate(release.date)),
		notes,
		downloads,
	);
}

async function init(): Promise<void> {
	const container = document.getElementById('changelog');

	try {
		const {releases} = await fetchReleaseIndex();

		container?.replaceChildren(...(releases.length
			? releases.map(renderRelease)
			: [el('p', {class: 'section__lead'}, 'No releases yet.')]));

		// The hash target did not exist when the browser tried to scroll to it.
		if (location.hash) {
			document.getElementById(location.hash.slice(1))?.scrollIntoView();
		}
	}
	catch {
		container?.replaceChildren(el('p', {class: 'section__lead'}, 'No releases yet.'));
	}
}

init();
