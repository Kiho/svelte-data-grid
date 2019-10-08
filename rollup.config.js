import svelte from 'rollup-plugin-svelte';
import pkg from './package.json';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

const name = pkg.name
	.replace(/^(@\S+\/)?(svelte-)?(\S+)/, '$3')
	.replace(/^\w/, m => m.toUpperCase())
	.replace(/-\w/g, m => m[1].toUpperCase());

export default [
	{
		input: 'src/data-grid.svelte',
		output: [
			{ file: pkg.module, 'format': 'es' },
			{ file: pkg.main, 'format': 'umd', name }
		],
		plugins: [
			svelte(),
			resolve(),
			commonjs()
		]
	},
	{
		input: 'src/select-cell.svelte',
		output: [
			{ file: 'select-cell.mjs', 'format': 'es' },
			{ file: 'select-cell.js', 'format': 'umd', name: 'select-cell' }
		],
		plugins: [
			svelte(),
			resolve(),
			commonjs()
		]
	},
	{
		input: 'src/textbox-cell.svelte',
		output: [
			{ file: 'textbox-cell.mjs', 'format': 'es' },
			{ file: 'textbox-cell.js', 'format': 'umd', name: 'textbox-cell' }
		],
		plugins: [
			svelte(),
			resolve(),
			commonjs()
		]
	},
	{
		input: 'src/checkbox-cell.svelte',
		output: [
			{ file: 'checkbox-cell.mjs', 'format': 'es' },
			{ file: 'checkbox-cell.js', 'format': 'umd', name: 'checkbox-cell' }
		],
		plugins: [
			svelte(),
			resolve(),
			commonjs()
		]
	}
];
