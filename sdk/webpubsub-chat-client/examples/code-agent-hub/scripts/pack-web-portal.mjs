import { access, copyFile, cp, mkdir, rm } from 'node:fs/promises';
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
const outDir = resolve(distRoot, 'web-portal');
const legacyOutDir = resolve(distRoot, 'web-server');
const publicOutDir = resolve(outDir, 'public');
const sharedOutDir = resolve(outDir, 'shared');
const outFile = resolve(outDir, 'web-portal.bundle.cjs');
const zipFile = resolve(distRoot, 'codeagenthub-web-portal.zip');
const legacyZipFile = resolve(distRoot, 'codeagenthub-web-server.zip');

async function assertReadable(label, filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`[pack:web-portal] Missing ${label}: ${filePath}`);
  }
}

async function copyRuntimeAsset(label, sourcePath, targetPath) {
  await assertReadable(label, sourcePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  console.log(`[pack:web-portal] Copied ${label} -> ${targetPath}`);
}

async function copyRuntimeDirectory(label, sourcePath, targetPath) {
  await assertReadable(label, sourcePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
  console.log(`[pack:web-portal] Copied ${label} -> ${targetPath}`);
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

export async function packWebPortal() {
  await rm(legacyOutDir, { recursive: true, force: true });
  await rm(legacyZipFile, { force: true });
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [resolve(projectRoot, 'web-portal', 'web-server.js')],
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

  await copyRuntimeDirectory(
    'web-portal public runtime assets',
    resolve(projectRoot, 'web-portal', 'public'),
    publicOutDir,
  );
  await copyRuntimeAsset(
    'shared session toolbar state',
    resolve(projectRoot, 'shared', 'session-toolbar-state.js'),
    resolve(sharedOutDir, 'session-toolbar-state.js'),
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

  await createZipFromDirectory(outDir, zipFile, 'codeagenthub-web-portal');

  console.log(`[pack:web-portal] Wrote ${outFile}`);
  console.log(`[pack:web-portal] Wrote ${zipFile}`);
  console.log('[pack:web-portal] web-portal bundle remains a single JS file, and the runtime package is archived with public assets plus browser-consumable shared modules.');
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  await packWebPortal();
}