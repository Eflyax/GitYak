import {el} from './releases';

// Cookie consent for Google Analytics. Google Tag Manager (which loads GA4) is only loaded after
// the visitor allows it, so nothing is sent to Google and no cookie is set before that. The
// choice is kept for a year in localStorage, and the "Cookie settings" link in the footer
// changes it at any time.

const
	GTM_ID = 'GTM-KHQBMV29',
	STORAGE_KEY = 'gityak:consent',
	MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export interface IConsent {
	analytics: boolean;
	/** When the visitor chose, in ms since the epoch. */
	date: number;
}

type TDataLayerWindow = typeof window & {dataLayer?: Array<unknown>};

/** The stored choice, or null when there is none, it cannot be read or it is older than a year. */
export function parseConsent(stored: string | null, now: number): IConsent | null {
	try {
		const value = JSON.parse(stored ?? 'null') as Partial<IConsent> | null;

		if (typeof value?.analytics !== 'boolean' || typeof value.date !== 'number' || now - value.date > MAX_AGE_MS) {
			return null;
		}

		return {analytics: value.analytics, date: value.date};
	}
	catch {
		return null;
	}
}

function storedConsent(): IConsent | null {
	try {
		return parseConsent(localStorage.getItem(STORAGE_KEY), Date.now());
	}
	catch {
		return null;
	}
}

function dataLayer(): Array<unknown> {
	const page = window as TDataLayerWindow;

	return (page.dataLayer = page.dataLayer ?? []);
}

// Consent Mode commands must be the `arguments` object of a gtag() call, not an array.
function gtag(..._args: Array<unknown>): void {
	// eslint-disable-next-line prefer-rest-params
	dataLayer().push(arguments);
}

let gtmLoaded = false;

function loadAnalytics(): void {
	if (gtmLoaded) {
		gtag('consent', 'update', {analytics_storage: 'granted'});

		return;
	}

	gtmLoaded = true;
	// GitYak shows no ads, so the ad signals stay denied.
	gtag('consent', 'default', {
		analytics_storage: 'granted',
		ad_storage: 'denied',
		ad_user_data: 'denied',
		ad_personalization: 'denied',
	});
	dataLayer().push({'gtm.start': Date.now(), event: 'gtm.js'});
	document.head.append(el('script', {async: '', src: `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}));
}

/** Stops Google Analytics on this page and removes its cookies (_ga, _ga_<id>). */
function stopAnalytics(): void {
	if (gtmLoaded) {
		gtag('consent', 'update', {analytics_storage: 'denied'});
	}

	const domains = ['', location.hostname, `.${location.hostname.replace(/^www\./, '')}`];

	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0].trim();

		if (name === '_ga' || name.startsWith('_ga_')) {
			for (const domain of domains) {
				document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
			}
		}
	}
}

function choose(analytics: boolean, banner: HTMLElement): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({analytics, date: Date.now()} satisfies IConsent));
	}
	catch {
		// Private mode without storage: the choice holds for this page only.
	}

	if (analytics) {
		loadAnalytics();
	}
	else {
		stopAnalytics();
	}

	banner.hidden = true;
}

function createBanner(): HTMLElement {
	const banner = el('section', {class: 'consent', 'aria-label': 'Cookie consent', hidden: ''},
		el('div', {class: 'container consent__inner'},
			el('p', {class: 'consent__text'},
				'May we count your visit? With your permission, the site uses Google Analytics to see how it is used and which installers are downloaded. ',
				'It sets cookies only if you allow it, and you can change your choice in ',
				el('strong', {}, 'Cookie settings'),
				' at the bottom of the page.',
			),
			el('div', {class: 'consent__actions'},
				el('button', {class: 'button button--small', type: 'button', 'data-consent': 'deny'}, 'Decline'),
				el('button', {class: 'button button--small', type: 'button', 'data-consent': 'allow'}, 'Allow'),
			),
		),
	);

	banner.addEventListener('click', event => {
		const choice = (event.target as Element | null)?.closest<HTMLElement>('[data-consent]')?.dataset.consent;

		if (choice) {
			choose(choice === 'allow', banner);
		}
	});

	document.body.append(banner);

	return banner;
}

/** Loads analytics when allowed, asks when there is no choice yet, and wires the footer link. */
export function initConsent(): void {
	const
		consent = storedConsent(),
		banner = createBanner();

	if (consent?.analytics) {
		loadAnalytics();
	}
	else if (!consent) {
		banner.hidden = false;
	}

	for (const link of document.querySelectorAll<HTMLElement>('[data-consent-open]')) {
		link.addEventListener('click', () => {
			banner.hidden = false;
			banner.querySelector<HTMLButtonElement>('[data-consent="deny"]')?.focus();
		});
	}
}
