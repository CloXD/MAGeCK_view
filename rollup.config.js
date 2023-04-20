import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';

// `npm run build` -> `production` is true
// `npm run dev` -> `production` is false
const production = !process.env.ROLLUP_WATCH;

export default {
	input: 'js/mageck.js',
	external : ['jquery', 'datatables.net-dt', 'plotly.js'],
	output: {
		file: 'dist/mageck.min.js',
        name : 'MGKV',
		format: 'iife', // immediately-invoked function expression — suitable for <script> tags
		sourcemap: true,
		globals : {jquery : '$'}
	},
	plugins: [
		resolve(),
		production && terser() // minify, but only in production
	]
};