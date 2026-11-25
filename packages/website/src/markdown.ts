// Release notes are short markdown written in tag messages: headings, lists, paragraphs and
// inline code, emphasis and links. This renders that subset; everything is escaped first, so
// nothing in the notes can inject markup.

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function inline(text: string): string {
	return escapeHtml(text)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

export function renderMarkdown(markdown: string): string {
	const html: Array<string> = [];
	let list: Array<string> = [];
	let paragraph: Array<string> = [];

	function flush(): void {
		if (list.length) {
			html.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
			list = [];
		}

		if (paragraph.length) {
			html.push(`<p>${inline(paragraph.join(' '))}</p>`);
			paragraph = [];
		}
	}

	for (const raw of markdown.split('\n')) {
		const line = raw.trim();
		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		const item = /^[-*+]\s+(.*)$/.exec(line);

		if (!line) {
			flush();
		}
		else if (heading) {
			flush();
			// Notes sit under the release's own heading, so their headings start one level down.
			const level = Math.min(heading[1].length + 2, 6);

			html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
		}
		else if (item) {
			if (paragraph.length) flush();
			list.push(item[1]);
		}
		else if (list.length && /^\s{2,}/.test(raw)) {
			// An indented continuation of the previous list item.
			list[list.length - 1] += ` ${line}`;
		}
		else {
			if (list.length) flush();
			paragraph.push(line);
		}
	}

	flush();

	return html.join('\n');
}
