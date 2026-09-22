import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  addUnreleasedSection,
  assertVersionAvailable,
  bumpPackage,
  checkPublicAvailability,
  getGithubAuthorization,
  nextBetaVersion,
  readReleasePackage,
} from './Npm-Release.mjs';

const scriptsFolder = path.dirname(fileURLToPath(import.meta.url));
let fixtureIndex = 0;

function fixture(t) {
  const folder = path.join(scriptsFolder, `.npm-release-test-${process.pid}-${fixtureIndex++}`);
  mkdirSync(folder);
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

function writePackage(folder, version = '1.2.3', changelog = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Retain this.\n\n## [1.2.3] - 2026-09-22\n') {
  const manifest = `{\n  "name": "@azure/test-package",\n  "version": "${version}",\n  "description": "Retain formatting"\n}\n`;
  writeFileSync(path.join(folder, 'package.json'), manifest);
  writeFileSync(path.join(folder, 'CHANGELOG.md'), changelog);
  return { manifest, changelog };
}

async function localServer(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('next beta follows beta increments and stable patch increments', () => {
  assert.equal(nextBetaVersion('1.0.0-beta.2'), '1.0.0-beta.3');
  assert.equal(nextBetaVersion('1.0.0-beta.0'), '1.0.0-beta.1');
  assert.equal(nextBetaVersion('2.0.0'), '2.0.1-beta.1');
  assert.equal(nextBetaVersion('1.2.999'), '1.2.1000-beta.1');
  assert.equal(nextBetaVersion('1.2.3-beta.9007199254740991'), '1.2.3-beta.9007199254740992');
  for (const invalid of ['1.2', 'v1.2.3', '1.2.3-alpha.1', '1.2.3-beta', '1.2.3-beta.01', '01.2.3', '1.2.3+build']) {
    assert.throws(() => nextBetaVersion(invalid), /Unsupported release version/);
  }
});

test('new section precedes the first heading without changing literal Unreleased content', () => {
  const changelog = '# Changelog\n\nIntro.\n\n## [Unreleased]\n\n- Pending change.\n\n## [1.2.3] - 2026-09-22\n';
  assert.equal(
    addUnreleasedSection(changelog, '1.2.4-beta.1'),
    changelog.replace('## [Unreleased]', '## [1.2.4-beta.1] - Unreleased\n\n## [Unreleased]'),
  );
});

test('new section preserves CRLF and inserts before a dated first release', () => {
  const changelog = '# Changelog\r\n\r\n## [1.2.3-beta.2] - 2026:09- 22\r\n\r\n- Released.\r\n';
  const updated = addUnreleasedSection(changelog, '1.2.3-beta.3');
  assert.equal(updated, changelog.replace('## [1.2.3-beta.2]', '## [1.2.3-beta.3] - Unreleased\r\n\r\n## [1.2.3-beta.2]'));
  assert.doesNotMatch(updated, /(?<!\r)\n/);
});

test('changelog update fails closed for missing headings, invalid versions, or duplicate versions', () => {
  assert.throws(() => addUnreleasedSection('# Changelog\n', '1.2.3'), /no release heading/);
  assert.throws(() => addUnreleasedSection('## [Unreleased]\n', 'invalid'), /Unsupported release version/);
  assert.throws(() => addUnreleasedSection('## [1.2.3-beta.4] - Unreleased\n', '1.2.3-beta.4'), /already contains/);
});

test('bump CLI updates package and changelog together, preserving manifest formatting', (t) => {
  const folder = fixture(t);
  const packageFolder = path.join(folder, 'package with spaces');
  mkdirSync(packageFolder);
  const original = writePackage(packageFolder, '1.2.3-beta.4');
  const manifest = original.manifest.replaceAll('  ', '\t').replaceAll('\n', '\r\n');
  writeFileSync(path.join(packageFolder, 'package.json'), manifest);
  const output = execFileSync(process.execPath, [
    path.join(scriptsFolder, 'Npm-Release.mjs'), 'bump', packageFolder, '1.2.3-beta.4',
  ], { encoding: 'utf8' });
  assert.equal(output.trim(), '1.2.3-beta.5');
  assert.equal(readFileSync(path.join(packageFolder, 'package.json'), 'utf8'), manifest.replace('1.2.3-beta.4', '1.2.3-beta.5'));
  assert.equal(readFileSync(path.join(packageFolder, 'CHANGELOG.md'), 'utf8'), original.changelog.replace('## [Unreleased]', '## [1.2.3-beta.5] - Unreleased\n\n## [Unreleased]'));
});

test('stable bump changes both files and validates the release identity without npm install', (t) => {
  const folder = fixture(t);
  writePackage(folder);
  assert.deepEqual(readReleasePackage(folder, '@azure/test-package', '1.2.3'), { name: '@azure/test-package', version: '1.2.3' });
  assert.throws(() => readReleasePackage(folder, '@azure/other', '1.2.3'), /does not match/);
  assert.throws(() => readReleasePackage(folder, '@azure/test-package', '1.2.4'), /does not match/);
  assert.equal(bumpPackage(folder, '1.2.3'), '1.2.4-beta.1');
  assert.equal(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version, '1.2.4-beta.1');
  assert.match(readFileSync(path.join(folder, 'CHANGELOG.md'), 'utf8'), /^## \[1\.2\.4-beta\.1\] - Unreleased$/m);
});

test('check CLI rejects mismatched package identity before credentials or network access', (t) => {
  const folder = fixture(t);
  writePackage(folder);
  const result = spawnSync(process.execPath, [
    path.join(scriptsFolder, 'Npm-Release.mjs'), 'check', folder, '@azure/wrong-package',
    'test-package', '1.2.3', 'Azure/azure-webpubsub',
  ], { cwd: folder, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /name\/version does not match/);
  assert.equal(result.stdout, '');
});

test('invalid bump leaves both source files unchanged', (t) => {
  const folder = fixture(t);
  const original = writePackage(folder);
  assert.throws(() => bumpPackage(folder, '9.9.9'), /does not match the published release/);
  assert.equal(readFileSync(path.join(folder, 'package.json'), 'utf8'), original.manifest);
  assert.equal(readFileSync(path.join(folder, 'CHANGELOG.md'), 'utf8'), original.changelog);
  writeFileSync(path.join(folder, 'CHANGELOG.md'), '# Changelog\n');
  assert.throws(() => bumpPackage(folder, '1.2.3'), /no release heading/);
  assert.equal(readFileSync(path.join(folder, 'package.json'), 'utf8'), original.manifest);
  assert.equal(readFileSync(path.join(folder, 'CHANGELOG.md'), 'utf8'), '# Changelog\n');
});

test('GitHub authorization reuses the persisted checkout extraheader', (t) => {
  const folder = fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: folder, stdio: 'pipe' });
  git('init', '--quiet');
  git('config', 'http.https://github.com/Azure/azure-webpubsub.extraheader', 'AUTHORIZATION: basic test-only-credential');
  assert.equal(getGithubAuthorization('Azure/azure-webpubsub', folder), 'basic test-only-credential');
  git('config', 'http.https://github.com/Azure/azure-webpubsub.extraheader', '');
  assert.throws(() => getGithubAuthorization('Azure/azure-webpubsub', folder), /must contain one Authorization/);
  assert.throws(() => getGithubAuthorization('Azure/azure-webpubsub', path.join(folder, 'missing')), /persistCredentials: true/);
});

test('HTTP availability permits only 404 and rejects every other status, including redirects', async (t) => {
  const requests = [];
  const base = await localServer(t, (request, response) => {
    requests.push(request.url);
    const status = Number(request.url.slice(1));
    response.writeHead(status, { Location: `${base}/404` });
    response.end();
  });
  await assertVersionAvailable(`${base}/404`, 'package');
  await assert.rejects(assertVersionAvailable(`${base}/200`, 'package'), /already exists/);
  for (const status of [201, 204, 301, 302, 307, 401, 403, 429, 500, 502, 503]) {
    await assert.rejects(assertVersionAvailable(`${base}/${status}`, 'package'), new RegExp(`unexpected HTTP ${status}`));
  }
  assert.equal(requests.filter((request) => request === '/404').length, 1, 'redirects must not become successful availability checks');
});

test('HTTP network errors and bounded request timeouts block publication', { timeout: 5000 }, async (t) => {
  const base = await localServer(t, (request) => {
    if (request.url === '/reset') request.socket.destroy();
  });
  await assert.rejects(assertVersionAvailable(`${base}/reset`, 'package'), /lookup failed or timed out/);
  await assert.rejects(assertVersionAvailable(`${base}/timeout`, 'package', { timeoutMs: 100 }), /lookup failed or timed out/);
});

test('public lookups use canonical npm and GitHub tag endpoints, with credentials only on GitHub', async () => {
  const requests = [];
  const release = {
    npmName: '@azure/web-pubsub-chat-client', packageName: 'web-pubsub-chat-client',
    version: '1.0.0-beta.2', githubRepo: 'Azure/azure-webpubsub', authorization: 'basic test-only-credential',
  };
  await checkPublicAvailability(release, {
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options });
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://registry.npmjs.org/%40azure%2Fweb-pubsub-chat-client/1.0.0-beta.2');
  assert.equal(requests[0].headers.Authorization, undefined);
  assert.equal(requests[1].url, 'https://api.github.com/repos/Azure/azure-webpubsub/git/ref/tags/release/web-pubsub-chat-client/v1.0.0-beta.2');
  assert.equal(requests[1].headers.Authorization, release.authorization);
  assert.equal(requests[1].headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.ok(requests.every((request) => request.redirect === 'manual' && request.signal instanceof AbortSignal));
  for (const status of [200, 403, 503]) {
    let calls = 0;
    await assert.rejects(checkPublicAvailability(release, {
      fetchImpl: async () => new Response(null, { status: ++calls === 1 ? 404 : status }),
    }), status === 200 ? /already exists/ : new RegExp(`unexpected HTTP ${status}`));
    assert.equal(calls, 2);
  }
  await assert.rejects(checkPublicAvailability({ ...release, authorization: '' }), /authorization is required/);
});

test('helper can be imported from node --eval without assuming a script argument', () => {
  execFileSync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(new URL('./Npm-Release.mjs', import.meta.url).href)});`]);
});
