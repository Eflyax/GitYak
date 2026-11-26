import type {IReleaseAsset} from '@git-yak/protocol';

// Download tracking: every installer link carries data-download-* attributes, and one click
// listener turns a click on such a link into a `download` event in GTM's data layer (GA4 does not
// track .dmg and .deb downloads by itself). The server's own log counts every download, this
// only adds where on the site it was clicked.

/** Where on the site the link is. */
export type TDownloadLocation = 'hero' | 'download_card' | 'download_table' | 'changelog';

export interface IDownloadEvent {
	event: 'download';
	release_version: string;
	platform: string;
	file_name: string;
	link_location: string;
	/** Whether the site suggested this platform for the visitor's system. */
	suggested: boolean;
}

/** Marks `link` as a download of `asset` for the click listener. */
export function markDownload(
	link: HTMLAnchorElement,
	asset: IReleaseAsset,
	version: string,
	location: TDownloadLocation,
	suggested: boolean,
): HTMLAnchorElement {
	Object.assign(link.dataset, {
		downloadVersion: version,
		downloadPlatform: asset.platform,
		downloadFile: asset.file,
		downloadLocation: location,
		downloadSuggested: String(suggested),
	});

	return link;
}

/** The data layer event of a marked link, or null for any other link. */
export function downloadEvent(dataset: DOMStringMap): IDownloadEvent | null {
	if (!dataset.downloadPlatform) {
		return null;
	}

	return {
		event: 'download',
		release_version: dataset.downloadVersion ?? '',
		platform: dataset.downloadPlatform,
		file_name: dataset.downloadFile ?? '',
		link_location: dataset.downloadLocation ?? '',
		suggested: dataset.downloadSuggested === 'true',
	};
}

/** Pushes a `download` event for every click on a marked link (including middle clicks). */
export function trackDownloads(): void {
	const onClick = (event: MouseEvent): void => {
		const link = (event.target as Element | null)?.closest?.('a');
		const data = link ? downloadEvent(link.dataset) : null;

		if (data) {
			const page = window as typeof window & {dataLayer?: Array<unknown>};

			(page.dataLayer = page.dataLayer ?? []).push(data);
		}
	};

	document.addEventListener('click', onClick);
	document.addEventListener('auxclick', event => {
		if (event.button === 1) {
			onClick(event);
		}
	});
}
