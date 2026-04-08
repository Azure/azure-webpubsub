import * as esbuild from 'esbuild';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';

// Node.js build
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'es2020',
  sourcemap: true,
  external: ['ws'],
});

// Browser build — Node.js built-ins are automatically polyfilled
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/browser/index.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  plugins: [
    polyfillNode({
      globals: { process: true, Buffer: true, global: true },
    }),
    // 'ws' is not needed in browser — stub it to use native WebSocket
    {
      name: 'browser-ws-stub',
      setup(build) {
        build.onResolve({ filter: /^ws$/ }, () => ({ path: 'ws', namespace: 'browser-ws' }));
        build.onLoad({ filter: /.*/, namespace: 'browser-ws' }, () => ({
          contents: 'export default globalThis.WebSocket;',
        }));
      },
    },
  ],
  alias: undefined,
});

console.log('Build complete: dist/index.js (node) + dist/browser/index.js (browser)');
