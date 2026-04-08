import { access, copyFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { build } from 'esbuild';

const modulePath = fileURLToPath(import.meta.url);
const scriptDir = dirname(modulePath);
const projectRoot = resolve(scriptDir, '..');
const repoRoot = resolve(projectRoot, '..', '..');
const distRoot = resolve(projectRoot, 'dist');
const outDir = resolve(distRoot, 'web-server');
const publicOutDir = resolve(outDir, 'public');
const outFile = resolve(outDir, 'web-server.bundle.cjs');
const zipFile = resolve(distRoot, 'codeagenthub-web-server.zip');

async function assertReadable(label, filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`[pack:web-server] Missing ${label}: ${filePath}`);
  }
}

async function copyRuntimeAsset(label, sourcePath, targetPath) {
  await assertReadable(label, sourcePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  console.log(`[pack:web-server] Copied ${label} -> ${targetPath}`);
}

async function createZipFromDirectory(sourceDir, targetZipPath, rootName) {
  await mkdir(dirname(targetZipPath), { recursive: true });
  await new Promise((resolvePromise, rejectPromise) => {
    const output = createWriteStream(targetZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolvePromise);
    output.on('error', rejectPromise);
    archive.on('error', rejectPromise);

    archive.pipe(output);
    archive.directory(sourceDir, rootName);
    archive.finalize();
  });
}

export async function packWebServer() {
  await mkdir(publicOutDir, { recursive: true });

  await build({
    entryPoints: [resolve(projectRoot, 'web-server.js')],
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
  });

  await copyRuntimeAsset(
    'portal html',
    resolve(projectRoot, 'public', 'index.html'),
    resolve(publicOutDir, 'index.html'),
  );
  await copyRuntimeAsset(
    'browser chat client',
    resolve(repoRoot, 'dist', 'browser', 'index.js'),
    resolve(publicOutDir, 'chat-client.js'),
  );
  await copyRuntimeAsset(
    'marked browser module',
    resolve(projectRoot, 'node_modules', 'marked', 'lib', 'marked.esm.js'),
    resolve(publicOutDir, 'marked.js'),
  );
  await copyRuntimeAsset(
    'dompurify browser module',
    resolve(projectRoot, 'node_modules', 'dompurify', 'dist', 'purify.es.mjs'),
    resolve(publicOutDir, 'dompurify.js'),
  );

  await createZipFromDirectory(outDir, zipFile, 'codeagenthub-web-server');

  console.log(`[pack:web-server] Wrote ${outFile}`);
  console.log(`[pack:web-server] Wrote ${zipFile}`);
  console.log('[pack:web-server] web-server bundle remains a single JS file, and the runtime package is archived with public assets.');
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  await packWebServer();
}