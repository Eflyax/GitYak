// Installer download counts from the gityak.com download log, read from stdin:
//
//   ssh root@85.255.6.155 'zcat -f /var/log/gityak/downloads.log*' | yarn downloads
//
// The log (deploy/nginx-gityak.com.conf) holds every installer request, also the ones the
// website's analytics never sees (ad blockers, direct links, the app's update notification).
import {RELEASE_PLATFORMS} from '../packages/protocol/src/releases';
import {countBy, parseDownloads} from './downloads/downloadLog';

const chunks: Array<Buffer> = [];

for await (const chunk of process.stdin) {
	chunks.push(chunk as Buffer);
}

const downloads = parseDownloads(Buffer.concat(chunks).toString('utf8'));

if (!downloads.length) {
	console.log('No downloads in the log yet.');
	process.exit(0);
}

const
	label = (platform: string): string => {
		return RELEASE_PLATFORMS.find(p => p.platform === platform)?.label ?? platform;
	},
	table = (title: string, rows: Array<[string, number]>): void => {
		const width = Math.max(...rows.map(([name]) => name.length));

		console.log(`\n${title}`);

		for (const [name, count] of rows) {
			console.log(`  ${name.padEnd(width)}  ${String(count).padStart(6)}`);
		}
	},
	times = downloads.map(d => d.time).sort(),
	notified = downloads.filter(d => d.source === 'app'),
	installed = downloads.filter(d => d.source === 'update'),
	updates = downloads.filter(d => d.source !== 'web');

console.log(`${downloads.length} downloads from ${times[0].slice(0, 10)} to ${times.at(-1)?.slice(0, 10)}`);
console.log(`  from the website and direct links: ${downloads.length - updates.length}`);
console.log(`  from the app's update notification: ${notified.length}`);
console.log(`  installed from the app (update): ${installed.length}`);
console.log(`  networks (addresses without their last part): ${new Set(downloads.map(d => d.client)).size}`);

table('By platform', countBy(downloads, d => label(d.platform)));
table('By version', countBy(downloads, d => d.version));
table('By month', countBy(downloads, d => d.time.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])));

if (updates.length) {
	table('Updates in the app', countBy(updates, d => `${d.fromVersion ?? '?'} → ${d.version}`));
}
