import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

export function nextBetaVersion(version) {
  const match = releaseVersionPattern.exec(version);
  if (!match) throw new Error(`Unsupported release version: ${version}`);
  const [, major, minor, patch, beta] = match;
  return beta === undefined
    ? `${major}.${minor}.${BigInt(patch) + 1n}-beta.1`
    : `${major}.${minor}.${patch}-beta.${BigInt(beta) + 1n}`;
}

export function addUnreleasedSection(changelog, version) {
  if (!releaseVersionPattern.test(version)) throw new Error(`Unsupported release version: ${version}`);
  const headings = [...changelog.matchAll(/^##[ \t]+([^\r\n]*)/gm)];
  if (headings.length === 0) throw new Error('CHANGELOG.md has no release heading.');
  if (headings.some((heading) => heading[1].startsWith(`[${version}]`))) {
    throw new Error(`CHANGELOG.md already contains ${version}.`);
  }
  const newline = changelog.includes('\r\n') ? '\r\n' : '\n';
  const firstHeading = headings[0].index;
  return `${changelog.slice(0, firstHeading)}## [${version}] - Unreleased${newline}${newline}${changelog.slice(firstHeading)}`;
}

export function bumpPackage(packageFolder, releaseVersion) {
  const packagePath = path.join(packageFolder, 'package.json');
  const changelogPath = path.join(packageFolder, 'CHANGELOG.md');
  const manifest = readFileSync(packagePath, 'utf8');
  if (JSON.parse(manifest).version !== releaseVersion) {
    throw new Error('package.json version does not match the published release.');
  }
  const nextVersion = nextBetaVersion(releaseVersion);
  const updatedChangelog = addUnreleasedSection(readFileSync(changelogPath, 'utf8'), nextVersion);
  const versionPattern = new RegExp(`("version"\\s*:\\s*")${releaseVersion.replaceAll('.', '\\.')}(")`);
  const updatedManifest = manifest.replace(versionPattern, (_, before, after) => `${before}${nextVersion}${after}`);
  if (JSON.parse(updatedManifest).version !== nextVersion) {
    throw new Error('Unable to update the top-level package.json version.');
  }
  writeFileSync(packagePath, updatedManifest);
  writeFileSync(changelogPath, updatedChangelog);
  return nextVersion;
}

export function readReleaseArtifact(packageFolder, expectedName, releaseVersion) {
  const files = readdirSync(packageFolder, { withFileTypes: true });
  if (files.length !== 1 || !files[0].isFile() || !files[0].name.endsWith('.tgz')) {
    throw new Error('Release folder must contain exactly one npm tarball and no other files.');
  }
  const manifest = JSON.parse(execFileSync('tar', [
    '-xOf', path.resolve(packageFolder, files[0].name), 'package/package.json',
  ], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }));
  if (manifest.name !== expectedName || manifest.version !== releaseVersion) {
    throw new Error('package.json name/version does not match the validated release artifact.');
  }
  nextBetaVersion(releaseVersion);
  return { name: manifest.name, version: manifest.version };
}

async function assertHttpStatus(url, label, expectedStatus, {
  headers = {}, timeoutMs = 15000, fetchImpl = fetch,
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
    await response.body?.cancel();
  } catch {
    throw new Error(`${label}: availability lookup failed or timed out; publication is blocked.`);
  }
  if (expectedStatus === 404 && response.status === 200) throw new Error(`${label} already exists.`);
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: unexpected HTTP ${response.status}; publication is blocked.`);
  }
}

export async function assertVersionAvailable(url, label, options = {}) {
  await assertHttpStatus(url, label, 404, options);
}

export async function checkPublicAvailability({ npmName, packageName, version, githubRepo }, options = {}) {
  nextBetaVersion(version);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepo)) throw new Error('Invalid GitHub repository.');
  if (!/^[A-Za-z0-9_.-]+$/.test(packageName)) throw new Error('Invalid release package name.');
  await assertVersionAvailable(
    `https://registry.npmjs.org/${encodeURIComponent(npmName)}/${encodeURIComponent(version)}`,
    `npm ${npmName}@${version}`,
    { ...options, headers: { Accept: 'application/json' } },
  );
  const githubOptions = {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'azure-webpubsub-release-bot',
    },
  };
  // This repository is public. Confirm it is accessible before treating a tag
  // lookup's 404 as available; private/missing repositories must fail closed.
  await assertHttpStatus(`https://api.github.com/repos/${githubRepo}`, 'Public GitHub repository', 200, githubOptions);
  const tag = `release/${packageName}/v${version}`;
  await assertVersionAvailable(
    `https://api.github.com/repos/${githubRepo}/git/ref/tags/${tag.split('/').map(encodeURIComponent).join('/')}`,
    `GitHub tag ${tag}`,
    githubOptions,
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'bump' && args.length === 2) {
    console.log(bumpPackage(...args));
  } else if (command === 'check' && args.length === 5) {
    const [packageFolder, npmName, packageName, version, githubRepo] = args;
    readReleaseArtifact(packageFolder, npmName, version);
    await checkPublicAvailability({ npmName, packageName, version, githubRepo });
    console.log(`Public npm version and release tag are available for ${npmName}@${version}.`);
  } else {
    throw new Error('Usage: Npm-Release.mjs check <tarball-folder> <npm-name> <package-name> <version> <github-repo> | bump <source-folder> <version>');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
