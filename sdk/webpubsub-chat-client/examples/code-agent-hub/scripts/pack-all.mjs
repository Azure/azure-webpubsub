import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDaemon } from './pack-daemon.mjs';
import { packWebServer } from './pack-web-server.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const distRoot = resolve(projectRoot, 'dist');

await mkdir(distRoot, { recursive: true });

for (const entry of await readdir(distRoot)) {
	await rm(resolve(distRoot, entry), { recursive: true, force: true });
}

console.log(`[pack:all] Cleaned ${distRoot}`);

await packDaemon();
await packWebServer();

console.log('[pack:all] Completed daemon and web-server packaging.');