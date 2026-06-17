const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	ts: 'typescript', tsx: 'typescript',
	js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
	json: 'json', jsonc: 'json',
	html: 'html', vue: 'html',
	css: 'css', scss: 'scss', less: 'less',
	md: 'markdown',
	rs: 'rust',
	py: 'python',
	sh: 'shell', bash: 'shell',
	yml: 'yaml', yaml: 'yaml',
	xml: 'xml',
	go: 'go',
	java: 'java',
	rb: 'ruby',
	php: 'php',
	c: 'c', cpp: 'cpp', h: 'cpp',
	cs: 'csharp',
	sql: 'sql',
	toml: 'ini',
};

export function getMonacoLanguage(filePath: string): string {
	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

	return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
}
