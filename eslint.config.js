import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/target/**',
			'packages/client/src-tauri/**',
			'packages/e2e/test-results/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...vue.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {...globals.browser, ...globals.node},
			parserOptions: {
				parser: tseslint.parser,
				ecmaVersion: 2022,
				sourceType: 'module',
			},
		},
		plugins: {'@stylistic': stylistic},
		rules: {
			'@stylistic/indent': ['error', 'tab'],
			'@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
			'@stylistic/semi': ['error', 'always'],
			'@stylistic/object-curly-spacing': ['error', 'never'],
			'@stylistic/brace-style': ['error', 'stroustrup', {allowSingleLine: true}],
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
			'@stylistic/eol-last': ['error', 'always'],
			'@stylistic/no-trailing-spaces': 'error',
			'@typescript-eslint/naming-convention': [
				'error',
				{selector: 'interface', format: ['PascalCase'], prefix: ['I']},
				{selector: 'enum', format: ['PascalCase'], prefix: ['E']},
			],
			'@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
			'vue/multi-word-component-names': 'off',
			'vue/html-indent': ['error', 'tab'],
		},
	},
	{
		// Vue SFC indentation is governed by vue/html-indent; the base rule fights it.
		files: ['**/*.vue'],
		rules: {'@stylistic/indent': 'off'},
	},
);
