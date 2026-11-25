import {describe, expect, it} from 'vitest';
import {renderMarkdown} from './markdown';

describe('renderMarkdown', () => {
	it('renders lists and paragraphs', () => {
		expect(renderMarkdown('Faster history\n\n- Image preview\n- Zoom')).toBe(
			'<p>Faster history</p>\n<ul><li>Image preview</li><li>Zoom</li></ul>',
		);
	});

	it('renders headings one level below the release heading', () => {
		expect(renderMarkdown('## Fixes')).toBe('<h4>Fixes</h4>');
	});

	it('renders inline code, emphasis and https links', () => {
		expect(renderMarkdown('Use `git` **now** *please* [docs](https://gityak.com)')).toBe(
			'<p>Use <code>git</code> <strong>now</strong> <em>please</em> <a href="https://gityak.com" rel="noopener">docs</a></p>',
		);
	});

	it('escapes HTML and ignores non-http links', () => {
		expect(renderMarkdown('<script>x</script> [a](javascript:alert(1))')).toBe(
			'<p>&lt;script&gt;x&lt;/script&gt; [a](javascript:alert(1))</p>',
		);
	});

	it('joins an indented continuation line to its list item', () => {
		expect(renderMarkdown('- First\n  continued\n- Second')).toBe('<ul><li>First continued</li><li>Second</li></ul>');
	});
});
