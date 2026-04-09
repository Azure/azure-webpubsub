import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const modulePath = fileURLToPath(import.meta.url);
const scriptDir = dirname(modulePath);
const projectRoot = resolve(scriptDir, '..');
const entryPoint = resolve(projectRoot, 'agent-daemon.js');
const outDir = resolve(projectRoot, 'dist', 'daemon');
const outFile = resolve(outDir, 'agent-daemon.bundle.cjs');

export async function packDaemon() {
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'info',
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: [
      '@github/copilot',
      '@agentclientprotocol/claude-agent-acp',
      '@zed-industries/codex-acp',
    ],
  });

  console.log(`[pack:daemon] Wrote ${outFile}`);
  console.log('[pack:daemon] Spawned ACP agent CLIs stay external and should be preinstalled in Docker.');
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  await packDaemon();
}