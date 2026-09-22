import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  PACKAGES,
  emitOutputs,
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

test('all package metadata is read and exactly matched', t => {
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

test('outputs contain every release version and product state plus the emulator preview', t => {
  const root = fixture(t);
  metadata(root);
  const outputs = releaseOutputs(readPackageVersions(root), '123');
  assert.equal(Object.keys(outputs).length, 9);
  for (const key of keys) {
    assert.equal(outputs[`${key}_releaseVersion`], versions[key]);
    assert.equal(outputs[`${key}_productState`], key === 'socketio' ? 'Current' : 'Beta');
  }
  assert.equal(outputs.emulator_previewVersion, '1.0.0-beta.1-preview-123');
  const lines = [];
  emitOutputs(outputs, line => lines.push(line));
  assert.deepEqual(parsedOutputs(lines.join('\n')), outputs);
});

test('output logging escapes Azure Pipelines control characters', () => {
  const lines = [];
  emitOutputs({ value: '%\r\n' }, line => lines.push(line));
  assert.deepEqual(lines, ['##vso[task.setvariable variable=value;isOutput=true]%AZP25%0D%0A']);
});

test('main needs only local metadata and a build ID', async t => {
  const root = fixture(t);
  metadata(root);
  const lines = [];
  const outputs = await main({ BUILD_BUILDID: '456' }, { cwd: root, write: line => lines.push(line) });
  assert.deepEqual(parsedOutputs(lines.join('\n')), outputs);
  assert.equal(outputs.emulator_previewVersion, '1.0.0-beta.1-preview-456');
  assert.equal(lines.length, 9);
});

test('real CLI works without Git, Azure credentials, history, or source commit variables', async t => {
  const root = fixture(t);
  metadata(root);
  const result = await runNode([helperPath], root, {
    PATH: '', Path: '', BUILD_BUILDID: '789', BUILD_SOURCEVERSION: '', BUILD_SOURCEBRANCH: '',
    SYSTEM_COLLECTIONURI: '', SYSTEM_TEAMPROJECT: '', SYSTEM_DEFINITIONID: '', SYSTEM_ACCESSTOKEN: '',
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(parsedOutputs(result.stdout), releaseOutputs(readPackageVersions(root), '789'));
});

test('invalid build IDs or any package metadata fail before emitting outputs', async t => {
  const root = fixture(t);
  metadata(root);
  for (const id of ['', '0', '01', '-1', 'invalid']) {
    const result = await runNode([helperPath], root, { BUILD_BUILDID: id });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /BUILD_BUILDID/);
    assert.equal(result.stdout, '');
  }
  for (const key of keys) {
    put(root, `${PACKAGES[key].folder}/CHANGELOG.md`, '## [9.9.9] - Unreleased');
    const result = await runNode([helperPath], root, { BUILD_BUILDID: '123' });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not equal/);
    assert.equal(result.stdout, '');
    metadata(root);
  }
});

test('module imports through node --eval without process.argv[1]', async () => {
  const result = await runNode(['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(helperPath).href)})`], repoRoot, {});
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
});
