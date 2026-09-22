import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  AUTOMATIC_STAGES,
  PACKAGE_INPUTS,
  PACKAGES,
  REQUEST_TIMEOUT_MS,
  TRIGGER_PATHS,
  affectedPackages,
  automaticStagesSucceeded,
  createAdoClient,
  emitOutputs,
  findAutomaticBaseline,
  getChangedFiles,
  main,
  previewVersion,
  readChangelogVersion,
  readEmulatorVersion,
  readPackageVersions,
  releaseOutputs,
  validateVersion,
} from './Get-ReleasePackages.mjs';

const helperPath = fileURLToPath(new URL('./Get-ReleasePackages.mjs', import.meta.url));
const repoRoot = resolve(dirname(helperPath), '..', '..');
const keys = ['emulator', 'chat_client', 'socketio', 'tunnel'];
const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const versions = { emulator: '1.0.0-beta.1', chat_client: '1.2.0-beta.2', socketio: '2.0.0', tunnel: '1.0.0-beta.15' };

function fixture(t) {
  // Keep all test repositories under the workspace, never in the system temp tree.
  const root = mkdtempSync(join(repoRoot, '.release-packages-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(root, relative, content) {
  const path = join(root, ...relative.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function metadata(root) {
  for (const [key, pkg] of Object.entries(PACKAGES)) {
    put(root, `${pkg.folder}/CHANGELOG.md`, `# Changelog\n\n## [Unreleased]\n\n## [${versions[key]}] - Unreleased\n`);
    put(root, `${pkg.folder}/${pkg.metadata}`, key === 'emulator'
      ? '<Project><PropertyGroup><VersionPrefix>1.0.0</VersionPrefix><VersionSuffix>beta.1</VersionSuffix></PropertyGroup></Project>'
      : JSON.stringify({ name: key, version: versions[key] }));
  }
}

function git(root, ...args) {
  const result = spawnSync('git', [
    '-c', 'user.name=Release helper tests', '-c', 'user.email=release-tests@example.invalid',
    '-c', 'commit.gpgSign=false', '-c', 'core.autocrlf=false',
    '-c', `core.hooksPath=${join(root, 'no-hooks')}`, ...args,
  ], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

function commit(root, message = 'fixture') {
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function gitFixture(t) {
  const root = fixture(t);
  git(root, 'init', '--quiet');
  metadata(root);
  put(root, 'Readme.md', 'unrelated documentation');
  commit(root);
  return root;
}

function timeline(overrides = {}) {
  return {
    records: AUTOMATIC_STAGES.map(identifier => ({
      type: 'Stage', identifier, name: `Display name for ${identifier}`,
      state: 'completed', result: 'succeeded', ...overrides[identifier],
    })),
  };
}

function build(id, extra = {}) {
  return { id, definition: { id: 12 }, sourceBranch: 'refs/heads/main', sourceVersion: sha,
    status: 'completed', result: 'succeeded', ...extra };
}

function env(root = repoRoot, extra = {}) {
  return {
    SYSTEM_COLLECTIONURI: 'https://dev.azure.com/example/', SYSTEM_TEAMPROJECT: 'Release Project',
    SYSTEM_DEFINITIONID: '12', BUILD_SOURCEBRANCH: 'refs/heads/main', BUILD_BUILDID: '100',
    BUILD_SOURCEVERSION: sha, BUILD_SOURCESDIRECTORY: root, SYSTEM_ACCESSTOKEN: 'test-token-not-a-credential',
    ...extra,
  };
}

async function server(t, handler) {
  const instance = createServer(handler);
  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => {
    instance.close(resolve);
    instance.closeAllConnections();
  }));
  return `http://127.0.0.1:${instance.address().port}/collection/`;
}

function runNode(args, cwd, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd, env: { ...process.env, ...environment }, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Test CLI timed out')); }, 15_000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}

function parsedOutputs(stdout) {
  return Object.fromEntries([...stdout.matchAll(/^##vso\[task\.setvariable variable=([^;]+);isOutput=true\](.*)$/gm)]
    .map(([, key, value]) => [key, value]));
}

test('canonical stable and beta versions, including zero fields, are accepted', () => {
  for (const version of ['0.0.0', '1.2.3', '10.20.300', '1.0.0-beta.0', '1.0.0-beta.12']) {
    assert.equal(validateVersion(version), version);
  }
});

test('leading zeros, alternate prereleases, build metadata, and non-string versions fail', () => {
  for (const version of [undefined, null, 1, '', 'v1.2.3', '01.2.3', '1.02.3', '1.2.03', '1.2.3-beta.01',
    '1.2.3-Beta.1', '1.2.3-beta', '1.2.3-beta.-1', '1.2.3-rc.1', '1.2.3-alpha.1', '1.2.3+build.1',
    '1.2.3-beta.1+build', ' 1.2.3', '1.2.3 ', '1.2.3\n', '1.2.3-preview-100', '1.2', '1.2.3.4']) {
    assert.throws(() => validateVersion(version), /Unsupported release version/, String(version));
  }
});

test('first bracketed version wins, skipping only the literal Unreleased placeholder', () => {
  const changelog = '# Changelog\r\n## [Unreleased]\r\n### Added\r\n## [1.0.0-beta.1] - Unreleased\r\n## [9.9.9] - 2020-01-01';
  assert.equal(readChangelogVersion(changelog), '1.0.0-beta.1');
  assert.equal(readChangelogVersion('## [2.0.0]\n## [1.0.0]'), '2.0.0');
  assert.throws(() => readChangelogVersion('## [1.0.0-rc.1]\n## [1.0.0]'), /Unsupported/);
  assert.throws(() => readChangelogVersion('## [unreleased]\n## [1.0.0]'), /Unsupported/);
  assert.throws(() => readChangelogVersion('## [Unreleased]\n### [1.0.0]\n## 1.0.0 - 2026-01-01'), /No bracketed/);
});

test('emulator literal prefix/suffix parsing handles stable, beta, whitespace, and comments', () => {
  for (const suffix of ['', '<VersionSuffix/>', '<VersionSuffix> </VersionSuffix>']) {
    assert.equal(readEmulatorVersion(`<Project><PropertyGroup><VersionPrefix>1.2.3</VersionPrefix>${suffix}</PropertyGroup></Project>`), '1.2.3');
  }
  assert.equal(readEmulatorVersion('<?xml version="1.0"?>\r\n<Project>\r\n<PropertyGroup>\n<!-- old <VersionPrefix>0.0.0</VersionPrefix> -->\n<VersionPrefix> 1.2.3 </VersionPrefix>\n<VersionSuffix>beta.2</VersionSuffix>\n</PropertyGroup>\n</Project>'), '1.2.3-beta.2');
});

test('ambiguous, conditional, malformed, or noncanonical emulator metadata fails', () => {
  for (const xml of [
    '<Project/>',
    '<Project><PropertyGroup Condition="true"><VersionPrefix>1.2.3</VersionPrefix></PropertyGroup></Project>',
    '<Project><PropertyGroup><VersionPrefix>1.2.3</VersionPrefix><VersionPrefix>1.2.4</VersionPrefix></PropertyGroup></Project>',
    '<Project><PropertyGroup><VersionPrefix>$(SomeVersion)</VersionPrefix></PropertyGroup></Project>',
    '<Project><PropertyGroup><VersionPrefix>1.2.3-beta.1</VersionPrefix></PropertyGroup></Project>',
    '<Project><PropertyGroup><VersionPrefix>01.2.3</VersionPrefix></PropertyGroup></Project>',
    '<Project><PropertyGroup><VersionPrefix>1.2.3</VersionPrefix><VersionSuffix>beta.01</VersionSuffix></PropertyGroup></Project>',
  ]) assert.throws(() => readEmulatorVersion(xml));
});

test('preview appends the exact requested suffix without dropping beta', () => {
  assert.equal(previewVersion('1.2.3', '123'), '1.2.3-preview-123');
  assert.equal(previewVersion('1.2.3-beta.1', '123'), '1.2.3-beta.1-preview-123');
  for (const id of [undefined, '', '01', '0', '-1', '1.2', '1e3', '123\n', '$(Build.BuildId)', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => previewVersion('1.2.3', id), /BUILD_BUILDID/);
  }
});

test('all package metadata is read and exactly matched, even for unchanged packages', t => {
  const root = fixture(t);
  metadata(root);
  const actual = readPackageVersions(root);
  for (const key of keys) {
    assert.equal(actual[key].releaseVersion, versions[key]);
    assert.equal(actual[key].productState, key === 'socketio' ? 'Current' : 'Beta');
    const pkg = PACKAGES[key];
    const mismatch = key === 'socketio' ? '2.0.1' : `${versions[key]}0`;
    put(root, `${pkg.folder}/CHANGELOG.md`, `## [${mismatch}] - Unreleased`);
    assert.throws(() => readPackageVersions(root), /does not equal/);
    metadata(root);
  }
  put(root, `${PACKAGES.socketio.folder}/package.json`, '{invalid json');
  assert.throws(() => readPackageVersions(root), /socketio:/);
  rmSync(join(root, PACKAGES.socketio.folder, 'package.json'));
  assert.throws(() => readPackageVersions(root), /socketio:.*ENOENT/);
});

test('real repository changelogs and metadata satisfy the same release contract', () => {
  const actual = readPackageVersions(repoRoot);
  assert.deepEqual(Object.keys(actual), keys);
  for (const pkg of Object.values(actual)) validateVersion(pkg.releaseVersion);
});

test('own package inputs and shared build dependencies map to the right releases', () => {
  const cases = [
    ['tools/emulator/src/program.cs', ['emulator']],
    ['sdk/webpubsub-chat-client/src/index.ts', ['chat_client']],
    ['sdk/webpubsub-socketio-extension/CHANGELOG.md', ['socketio']],
    ['tools/awps-tunnel/server/package.json', ['socketio', 'tunnel']],
    ['tools/awps-tunnel/client/vite.config.ts', ['socketio', 'tunnel']],
    ['tools/awps-tunnel/yarn.lock', ['socketio', 'tunnel']],
    ['sdk/server-proxies/src/index.ts', ['socketio', 'tunnel']],
    ['protocols/protobuf.webpubsub.azure.v1/webpubsub.v1.proto', ['emulator']],
    ['microsoft.png', ['emulator']],
    ['Directory.Build.props', ['emulator']],
    ['NuGet.Config', ['emulator']],
    ['package.json', keys], ['yarn.lock', keys], ['.npmrc', keys], ['LICENSE', keys],
    ['.pipelines/README.md', keys], ['.pipelines/release.yml', keys],
    ['.pipelines/templates/stages/release-package.yml', keys],
    ['.pipelines/scripts/Build-EmulatorPackage.ps1', keys],
    ['.pipelines/scripts/Get-ReleasePackages.mjs', keys],
    ['.pipelines/scripts/Get-ReleasePackages.test.mjs', keys],
  ];
  for (const [path, expected] of cases) {
    const changed = affectedPackages([path]);
    assert.deepEqual(keys.filter(key => changed[key]), expected, path);
  }
});

test('classification is exact at directory boundaries and unrelated changes remain cheap', () => {
  const changed = affectedPackages(['Readme.md', 'website/src/index.ts', 'samples/chat.js',
    'tools/emulator-other/x', 'sdk/server-proxies-old/x', '.pipelines-other/release.yml',
    'nested/package.json', 'protocols/protobuf.webpubsub.azure.v10/example.proto']);
  assert.deepEqual(changed, Object.fromEntries(keys.map(key => [key, false])));
  assert.deepEqual(affectedPackages([], true), Object.fromEntries(keys.map(key => [key, true])));
});

test('exported trigger union covers every own/shared input without duplicates', () => {
  assert.deepEqual(TRIGGER_PATHS, [...new Set(Object.values(PACKAGE_INPUTS).flat())]);
  assert.deepEqual(Object.keys(PACKAGE_INPUTS), Object.keys(PACKAGES));
  for (const [key, patterns] of Object.entries(PACKAGE_INPUTS)) {
    for (const pattern of patterns) {
      const path = pattern.endsWith('/**') ? pattern.slice(0, -2) + 'nested/file' : pattern;
      assert.equal(affectedPackages([path])[key], true, `${key}: ${pattern}`);
    }
  }
});

test('outputs include all fourteen ADO variables with Beta/Current and lowercase booleans', t => {
  const root = fixture(t);
  metadata(root);
  const outputs = releaseOutputs(readPackageVersions(root), affectedPackages(['sdk/webpubsub-chat-client/src/index.ts']), '77');
  assert.equal(Object.keys(outputs).length, 14);
  assert.equal(outputs.anyChanged, 'true');
  assert.equal(outputs.emulator_needsRelease, 'false');
  assert.equal(outputs.chat_client_needsRelease, 'true');
  assert.equal(outputs.emulator_previewVersion, '1.0.0-beta.1-preview-77');
  assert.equal(outputs.emulator_productState, 'Beta');
  assert.equal(outputs.socketio_productState, 'Current');
  const lines = [];
  emitOutputs(outputs, line => lines.push(line));
  assert.deepEqual(parsedOutputs(lines.join('\n')), outputs);
  assert.equal(releaseOutputs(readPackageVersions(root), affectedPackages([]), '77').anyChanged, 'false');
  const escaped = [];
  emitOutputs({ value: 'a%\r\nb' }, line => escaped.push(line));
  assert.deepEqual(escaped, ['##vso[task.setvariable variable=value;isOutput=true]a%AZP25%0D%0Ab']);
});

test('real git diff spans all commits and preserves deleted and NUL-delimited Unicode paths', t => {
  const root = gitFixture(t);
  put(root, 'tools/emulator/deleted.cs', 'original');
  const baseline = commit(root);
  rmSync(join(root, 'tools', 'emulator', 'deleted.cs'));
  put(root, 'sdk/webpubsub-chat-client/雪 % source.ts', 'first change');
  commit(root, 'first change');
  put(root, 'tools/awps-tunnel/server/new.ts', 'second change');
  const head = commit(root, 'second change');
  const changed = getChangedFiles(root, baseline, head);
  assert.equal(changed.allPackages, false);
  assert.deepEqual(new Set(changed.files), new Set([
    'tools/emulator/deleted.cs', 'sdk/webpubsub-chat-client/雪 % source.ts', 'tools/awps-tunnel/server/new.ts',
  ]));
  assert.deepEqual(affectedPackages(changed.files), Object.fromEntries(keys.map(key => [key, true])));
  assert.deepEqual(getChangedFiles(root, head, head).files, []);
});

test('real rename across package boundaries reports both old and new paths', t => {
  const root = gitFixture(t);
  put(root, 'tools/emulator/renamed.txt', 'identical content');
  const baseline = commit(root);
  git(root, 'mv', 'tools/emulator/renamed.txt', 'sdk/webpubsub-chat-client/renamed.txt');
  const head = commit(root);
  const changed = getChangedFiles(root, baseline, head);
  assert.deepEqual(new Set(changed.files), new Set(['tools/emulator/renamed.txt', 'sdk/webpubsub-chat-client/renamed.txt']));
  assert.deepEqual(affectedPackages(changed.files), { emulator: true, chat_client: true, socketio: false, tunnel: false });
});

test('missing baseline or a divergent real git baseline explicitly selects all packages', t => {
  const root = gitFixture(t);
  const original = git(root, 'rev-parse', 'HEAD');
  put(root, 'Readme.md', 'other branch');
  const divergent = commit(root);
  git(root, 'checkout', '--quiet', '--detach', original);
  put(root, 'Readme.md', 'current branch');
  const head = commit(root);
  for (const [baseline, reason] of [[null, /No valid/], ['c'.repeat(40), /missing/], [divergent, /not an ancestor/]]) {
    const changed = getChangedFiles(root, baseline, head);
    assert.equal(changed.allPackages, true);
    assert.match(changed.reason, reason);
    assert.deepEqual(changed.files, []);
  }
});

test('git failures never masquerade as no changes or a missing baseline', t => {
  const root = gitFixture(t);
  const baseline = git(root, 'rev-parse', 'HEAD');
  put(root, 'Readme.md', 'change');
  const head = commit(root);
  assert.throws(() => getChangedFiles(root, baseline, 'd'.repeat(40)), /git rev-parse failed/);
  git(root, 'config', 'diff.algorithm', 'invalid-algorithm');
  assert.throws(() => getChangedFiles(root, baseline, head), /git diff failed/);
  const empty = fixture(t);
  assert.throws(() => getChangedFiles(empty, null, head), /git rev-parse failed/);
});

test('shallow checkouts fail with an actionable full-history requirement', t => {
  const root = gitFixture(t);
  const clone = join(fixture(t), 'clone');
  git(root, 'clone', '--quiet', '--depth=1', pathToFileURL(root).href, clone);
  assert.equal(git(clone, 'rev-parse', '--is-shallow-repository'), 'true');
  assert.throws(() => getChangedFiles(clone, null), /fetchDepth: 0/);
});

test('automatic stages allow completed skipped except release_check must succeed', () => {
  assert.equal(automaticStagesSucceeded(timeline()), true);
  for (const identifier of AUTOMATIC_STAGES) {
    assert.equal(automaticStagesSucceeded(timeline({ [identifier]: { result: 'skipped' } })), identifier !== 'release_check');
    for (const result of ['failed', 'canceled', 'abandoned', 'succeededWithIssues', 'Succeeded', null, undefined]) {
      assert.equal(automaticStagesSucceeded(timeline({ [identifier]: { result } })), false, `${identifier}: ${result}`);
    }
    for (const state of ['pending', 'inProgress', 'Completed', null, undefined]) {
      assert.equal(automaticStagesSucceeded(timeline({ [identifier]: { state } })), false, `${identifier}: ${state}`);
    }
  }
});

test('pending/rejected manual publishing and approval records do not block the automatic baseline', () => {
  for (const state of ['pending', 'inProgress', 'completed']) {
    const data = timeline();
    data.records.push(
      { type: 'Stage', identifier: 'Prod_npm_release', state, result: state === 'completed' ? 'failed' : null },
      { type: 'Stage', identifier: 'Prod_chat_client_publish', state, result: 'failed' },
      { type: 'Stage', identifier: 'Prod_socketio_publish', state, result: 'canceled' },
      { type: 'Checkpoint.Approval', identifier: 'manual_approval', state, result: 'rejected' },
    );
    assert.equal(automaticStagesSucceeded(data), true);
  }
});

test('invalid or missing timeline records, display-name lookalikes, jobs, and duplicates fail closed', () => {
  for (const data of [null, {}, { records: null }, { records: [] }, { records: [null] }]) {
    assert.equal(automaticStagesSucceeded(data), false);
  }
  for (const identifier of AUTOMATIC_STAGES) {
    const data = timeline();
    data.records = data.records.filter(record => record.identifier !== identifier);
    assert.equal(automaticStagesSucceeded(data), false);
    assert.equal(automaticStagesSucceeded(timeline({ [identifier]: { identifier: 'other', name: identifier } })), false);
    assert.equal(automaticStagesSucceeded(timeline({ [identifier]: { type: 'Job' } })), false);
  }
  const duplicate = timeline();
  duplicate.records.push({ ...duplicate.records[0] });
  assert.equal(automaticStagesSucceeded(duplicate), false);
  const invalid = timeline();
  invalid.records.push(null);
  assert.equal(automaticStagesSucceeded(invalid), false);
});

test('baseline uses newest prior same-definition/branch automatic success despite a failed manual stage', async () => {
  const queried = [];
  const client = {
    listBuilds: async () => [
      build(60, { sourceVersion: otherSha }), build(99), build(75, { status: 'inProgress', result: 'failed' }),
      build(101), build(100), build(98, { sourceBranch: 'refs/heads/release/other' }),
      build(97, { definition: { id: 11 } }), build(96, { sourceVersion: null }), build(95, { sourceVersion: 'short' }),
      { id: 94 }, null, build('93'), build(0),
    ],
    getTimeline: async id => {
      queried.push(id);
      return id === 99 ? timeline({ emulator_myget: { state: 'pending' } }) : timeline();
    },
    getBuild: async id => build(id, { result: 'failed' }),
  };
  assert.equal(await findAutomaticBaseline(client, { definitionId: '12', sourceBranch: 'refs/heads/main', buildId: '100' }), sha);
  assert.deepEqual(queried, [99, 75]);
});

test('canceled, cancelling, and unknown build states never validate skipped affected stages', async () => {
  const context = { definitionId: 12, sourceBranch: 'refs/heads/main', buildId: 100 };
  for (const state of [
    { status: 'completed', result: 'canceled' },
    { status: 'cancelling', result: 'none' },
    { status: 'cancelling', result: 'failed' },
    { status: 'inProgress', result: 'canceled' },
    { status: undefined }, { status: 'unknown' }, { status: 'notStarted' },
    { result: undefined }, { result: null }, { result: 'none' }, { result: 'unknown' },
  ]) {
    const client = {
      listBuilds: async () => [build(99, state)],
      getTimeline: assert.fail,
      getBuild: assert.fail,
    };
    assert.equal(await findAutomaticBaseline(client, context), null, JSON.stringify(state));
  }
});

test('refresh after timeline rejects cancellation and invalid metadata instead of advancing the baseline', async () => {
  const context = { definitionId: 12, sourceBranch: 'refs/heads/main', buildId: 100 };
  const skipped = timeline(Object.fromEntries(AUTOMATIC_STAGES.filter(stage => stage !== 'release_check')
    .map(stage => [stage, { result: 'skipped' }])));
  for (const refreshed of [
    build(99, { status: 'cancelling', result: null }),
    build(99, { result: 'canceled' }),
    build(99, { sourceVersion: otherSha }),
    build(99, { sourceBranch: 'refs/heads/other' }),
    build(99, { definition: { id: 13 } }),
    build(98), null, {},
  ]) {
    const client = {
      listBuilds: async () => [build(99, { status: 'inProgress', result: null }), build(60, { sourceVersion: otherSha })],
      getTimeline: async () => skipped,
      getBuild: async id => id === 99 ? refreshed : build(60, { sourceVersion: otherSha }),
    };
    assert.equal(await findAutomaticBaseline(client, context), otherSha);
  }
});

test('pending and rejected manual npm gates still allow a noncanceled automatic baseline', async () => {
  const context = { definitionId: 12, sourceBranch: 'refs/heads/main', buildId: 100 };
  for (const state of [
    { status: 'inProgress', result: undefined }, { status: 'inProgress', result: null },
    { status: 'inProgress', result: 'none' }, { status: 'completed', result: 'failed' },
  ]) {
    const data = timeline({ socketio_build: { result: 'skipped' } });
    data.records.push({ type: 'Stage', identifier: 'Prod_npm_release', state: 'pending', result: null },
      { type: 'Checkpoint.Approval', identifier: 'npm_approval', state: 'completed', result: 'rejected' });
    const client = {
      listBuilds: async () => [build(99, state)],
      getTimeline: async () => data,
      getBuild: async () => build(99, state),
    };
    assert.equal(await findAutomaticBaseline(client, context), sha, JSON.stringify(state));
  }
});

test('no valid recent timeline yields no baseline; API failures are not treated as a first run', async () => {
  const context = { definitionId: 12, sourceBranch: 'refs/heads/main', buildId: 100 };
  assert.equal(await findAutomaticBaseline({ listBuilds: async () => [], getTimeline: assert.fail }, context), null);
  assert.equal(await findAutomaticBaseline({ listBuilds: async () => [build(99)], getTimeline: async () => ({ records: [] }) }, context), null);
  await assert.rejects(findAutomaticBaseline({ listBuilds: async () => { throw new Error('Unauthorized'); } }, context), /Unauthorized/);
  await assert.rejects(findAutomaticBaseline({ listBuilds: async () => [build(99)], getTimeline: async () => { throw new Error('Forbidden'); } }, context), /Forbidden/);
  await assert.rejects(findAutomaticBaseline({ listBuilds: async () => [build(99)], getTimeline: async () => timeline(),
    getBuild: async () => { throw new Error('Refresh forbidden'); } }, context), /Refresh forbidden/);
});

test('REST adapter uses standard variables, project encoding, bearer auth, 25 builds, and no completion filter', async () => {
  const calls = [];
  const client = createAdoClient(env(), { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.pathname.endsWith('/timeline') ? timeline()
      : url.pathname.endsWith('/90') ? build(90) : { value: Array.from({ length: 26 }, (_, i) => build(i + 1)) } };
  } });
  assert.equal((await client.listBuilds()).length, 25);
  assert.equal(automaticStagesSucceeded(await client.getTimeline(90)), true);
  assert.deepEqual(await client.getBuild(90), build(90));
  const { url, options } = calls[0];
  assert.equal(url.origin, 'https://dev.azure.com');
  assert.equal(url.pathname, '/example/Release%20Project/_apis/build/builds');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    definitions: '12', branchName: 'refs/heads/main', '$top': '25', queryOrder: 'queueTimeDescending', 'api-version': '7.1',
  });
  assert.equal(options.headers.Authorization, 'Bearer test-token-not-a-credential');
  assert.equal(options.redirect, 'error');
  assert.equal(options.signal instanceof AbortSignal, true);
  assert.equal(REQUEST_TIMEOUT_MS, 30_000);
  assert.equal(calls[1].url.pathname, '/example/Release%20Project/_apis/build/builds/90/timeline');
  assert.equal(calls[1].url.searchParams.get('api-version'), '7.1');
  assert.equal(calls[2].url.pathname, '/example/Release%20Project/_apis/build/builds/90');
  assert.equal(calls[2].url.searchParams.get('api-version'), '7.1');
  let projectPath;
  await createAdoClient(env(repoRoot, { SYSTEM_TEAMPROJECT: '', SYSTEM_TEAMPROJECTID: 'project-guid' }), {
    fetchImpl: async url => { projectPath = url.pathname; return { ok: true, json: async () => ({ value: [] }) }; },
  }).listBuilds();
  assert.equal(projectPath, '/example/project-guid/_apis/build/builds');
});

test('REST pagination fills 25 prior builds after excluding current/later IDs and duplicate records', async () => {
  const calls = [];
  const client = createAdoClient(env(), { fetchImpl: async url => {
    calls.push(url);
    const secondPage = url.searchParams.has('continuationToken');
    const value = secondPage
      ? Array.from({ length: 25 }, (_, index) => build(77 - index))
      : [build(101), build(100), ...Array.from({ length: 23 }, (_, index) => build(99 - index))];
    return new Response(JSON.stringify({ value }), {
      headers: { 'x-ms-continuationtoken': secondPage ? 'unused-next-page' : 'next page + cursor' },
    });
  } });
  const builds = await client.listBuilds();
  assert.deepEqual(builds.map(item => item.id), Array.from({ length: 25 }, (_, index) => 99 - index));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('continuationToken'), 'next page + cursor');
  for (const url of calls) {
    assert.equal(url.searchParams.get('$top'), '25');
    assert.equal(url.searchParams.get('definitions'), '12');
    assert.equal(url.searchParams.get('branchName'), 'refs/heads/main');
    assert.equal(url.searchParams.has('statusFilter'), false);
  }
});

test('REST pagination fails closed on repeated cursors and later-page errors', async () => {
  const stuck = createAdoClient(env(), { fetchImpl: async () => new Response(JSON.stringify({ value: [build(99)] }), {
    headers: { 'x-ms-continuationtoken': 'same-cursor' },
  }) });
  await assert.rejects(stuck.listBuilds(), /pagination did not advance/);
  let count = 0;
  const failed = createAdoClient(env(), { fetchImpl: async () => ++count === 1
    ? new Response(JSON.stringify({ value: [build(100)] }), { headers: { 'x-ms-continuationtoken': 'next' } })
    : new Response(null, { status: 401 }) });
  await assert.rejects(failed.listBuilds(), /HTTP 401/);
  assert.equal(count, 2);
});

test('REST HTTP/auth/schema/network errors throw without converting failures to an empty list', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const client = createAdoClient(env(), { fetchImpl: async () => ({ ok: false, status }) });
    await assert.rejects(client.listBuilds(), new RegExp(`HTTP ${status}`));
    await assert.rejects(client.getTimeline(90), new RegExp(`HTTP ${status}`));
    await assert.rejects(client.getBuild(90), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(createAdoClient(env(), { fetchImpl: async () => { throw new Error('network down'); } }).listBuilds(), /network down/);
  await assert.rejects(createAdoClient(env(), { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }).listBuilds(), /Invalid Azure DevOps/);
  await assert.rejects(createAdoClient(env(), { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('Invalid JSON'); } }) }).listBuilds(), /Invalid JSON/);
  for (const name of ['SYSTEM_COLLECTIONURI', 'SYSTEM_TEAMPROJECT', 'SYSTEM_DEFINITIONID', 'BUILD_SOURCEBRANCH', 'SYSTEM_ACCESSTOKEN']) {
    assert.throws(() => createAdoClient(env(repoRoot, { [name]: '' })), /Missing/);
  }
  assert.throws(() => createAdoClient(env(repoRoot, { SYSTEM_DEFINITIONID: '01' })), /positive integer/);
  assert.throws(() => createAdoClient(env(repoRoot, { SYSTEM_COLLECTIONURI: 'https://user:secret@example.invalid/' })), /Invalid/);
});

test('REST timeout aborts a real local HTTP request, including a stalled response body', async t => {
  const collection = await server(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"value":');
  });
  const client = createAdoClient(env(repoRoot, { SYSTEM_COLLECTIONURI: collection }), { timeoutMs: 50 });
  await assert.rejects(client.listBuilds(), /request failed:.*(timed out|abort)/i);
});

test('main emits all packages on a first run, and nothing on metadata or REST errors', async t => {
  const root = gitFixture(t);
  const currentEnv = env(root, { BUILD_SOURCEVERSION: git(root, 'rev-parse', 'HEAD') });
  const lines = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ value: [] }) });
  const outputs = await main(currentEnv, { cwd: root, fetchImpl, write: line => lines.push(line) });
  for (const key of keys) assert.equal(outputs[`${key}_needsRelease`], 'true');
  assert.match(lines[0], /No valid recent automatic baseline/);
  assert.deepEqual(parsedOutputs(lines.join('\n')), outputs);
  const failures = [];
  await assert.rejects(main(currentEnv, { cwd: root, fetchImpl: async () => ({ ok: false, status: 401 }), write: line => failures.push(line) }), /HTTP 401/);
  await assert.rejects(main({ ...currentEnv, BUILD_SOURCEVERSION: sha }, { cwd: root, fetchImpl: assert.fail, write: line => failures.push(line) }), /HEAD does not match/);
  await assert.rejects(main({ ...currentEnv, BUILD_SOURCEVERSION: 'bad' }, { cwd: root, fetchImpl: assert.fail, write: line => failures.push(line) }), /full Git commit SHA/);
  put(root, `${PACKAGES.chat_client.folder}/CHANGELOG.md`, '## [2.0.0]');
  await assert.rejects(main(currentEnv, { cwd: root, fetchImpl: assert.fail, write: line => failures.push(line) }), /does not equal/);
  assert.deepEqual(failures, []);
});

test('CLI uses repo-root cwd even when ADO sources directory differs, and emits only affected packages', async t => {
  const root = gitFixture(t);
  put(root, '.pipelines/scripts/placeholder', '');
  rmSync(join(root, '.pipelines', 'scripts', 'placeholder'));
  copyFileSync(helperPath, join(root, '.pipelines', 'scripts', 'Get-ReleasePackages.mjs'));
  const baseline = commit(root);
  put(root, 'sdk/webpubsub-chat-client/src/change.ts', 'export const changed = true;');
  const head = commit(root);
  const requests = [];
  const collection = await server(t, (request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    const stages = timeline({ emulator_build: { result: 'skipped' }, emulator_myget: { result: 'skipped' } });
    stages.records.push({ type: 'Stage', identifier: 'Prod_npm_release', state: 'pending', result: null });
    response.end(JSON.stringify(request.url.includes('/timeline?') ? stages
      : request.url.includes('/builds/90?') ? build(90, { sourceVersion: baseline, status: 'inProgress', result: null })
      : { value: [build(100, { sourceVersion: head }), build(90, { sourceVersion: baseline, status: 'inProgress', result: null })] }));
  });
  const currentEnv = env(dirname(root), { BUILD_SOURCEVERSION: head, SYSTEM_COLLECTIONURI: collection });
  const result = await runNode([join('.pipelines', 'scripts', 'Get-ReleasePackages.mjs')], root, currentEnv);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  const outputs = parsedOutputs(result.stdout);
  assert.equal(Object.keys(outputs).length, 14);
  for (const key of keys) assert.equal(outputs[`${key}_needsRelease`], String(key === 'chat_client'));
  assert.equal(outputs.emulator_releaseVersion, '1.0.0-beta.1');
  assert.equal(outputs.emulator_previewVersion, '1.0.0-beta.1-preview-100');
  assert.equal(outputs.anyChanged, 'true');
  assert.equal(requests.length, 3);
  assert.match(requests[1].url, /\/builds\/90\/timeline\?/);
  assert.match(requests[2].url, /\/builds\/90\?/);
  assert.equal(requests[0].authorization, 'Bearer test-token-not-a-credential');
  const failed = await runNode([helperPath], root, { ...currentEnv, SYSTEM_ACCESSTOKEN: '' });
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /Missing SYSTEM_ACCESSTOKEN/);
  assert.equal(Object.keys(parsedOutputs(failed.stdout)).length, 0);
});

test('import from node --eval is safe with no process.argv[1] or Azure configuration', async () => {
  const result = await runNode(['--input-type=module', '--eval', `
    if (process.argv[1] !== undefined) throw new Error('Expected no argv[1]');
    await import(${JSON.stringify(pathToFileURL(helperPath).href)});
  `], repoRoot, { SYSTEM_ACCESSTOKEN: '', BUILD_BUILDID: '', BUILD_SOURCEVERSION: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
