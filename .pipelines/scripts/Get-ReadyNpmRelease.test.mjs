import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { NPM_ARTIFACTS, assertSameBuild, main, readyPackages } from './Get-ReadyNpmRelease.mjs';
import { PACKAGES } from './Get-ReleasePackages.mjs';

const helperPath = fileURLToPath(new URL('./Get-ReadyNpmRelease.mjs', import.meta.url));
const repoRoot = resolve(dirname(helperPath), '..', '..');
const npmKeys = ['chat_client', 'socketio', 'tunnel'];
const requiredStages = ['release_check', ...npmKeys.map(key => `${key}_build`)];
const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const versions = { emulator: '1.0.0-beta.1', chat_client: '1.2.0-beta.2', socketio: '2.0.0', tunnel: '1.0.0-beta.15' };
const token = 'local-release-test-token-not-a-credential';
const basePath = '/collection/Release%20Project/_apis/build/builds/100';
const requestPaths = [basePath, `${basePath}/timeline`, `${basePath}/artifacts`, basePath]
  .map(path => `${path}?api-version=7.1`);

function timeline(overrides = {}) {
  return { records: requiredStages.map(identifier => ({
    type: 'Stage', identifier, name: `Editable display name for ${identifier}`,
    state: 'completed', result: 'succeeded', ...overrides[identifier],
  })) };
}

function artifacts(keys = npmKeys) {
  return { value: keys.map(key => ({ name: NPM_ARTIFACTS[key], resource: { type: 'PipelineArtifact' } })) };
}

function build(overrides = {}) {
  return { id: 100, definition: { id: 12 }, sourceBranch: 'refs/heads/main', sourceVersion: sha,
    status: 'completed', result: 'succeeded', ...overrides };
}

function environment(overrides = {}) {
  return {
    SYSTEM_COLLECTIONURI: 'http://127.0.0.1:1/collection/', SYSTEM_TEAMPROJECT: 'Release Project',
    SYSTEM_TEAMPROJECTID: '', SYSTEM_DEFINITIONID: '12', BUILD_BUILDID: '100',
    BUILD_SOURCEBRANCH: 'refs/heads/main', BUILD_SOURCEVERSION: sha, SYSTEM_ACCESSTOKEN: token,
    ...overrides,
  };
}

function fixture(t) {
  const root = mkdtempSync(join(repoRoot, '.ready-npm-release-test-'));
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

function isolatedEnv(root, extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'no-global-git-config'),
    GIT_CEILING_DIRECTORIES: repoRoot, ...extra,
  };
}

function git(root, ...args) {
  const result = spawnSync('git', [
    '-c', 'user.name=Release readiness tests', '-c', 'user.email=release-tests@example.invalid',
    '-c', 'commit.gpgSign=false', '-c', 'core.autocrlf=false',
    '-c', `core.hooksPath=${join(root, 'no-hooks')}`, ...args,
  ], { cwd: root, env: isolatedEnv(root), encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}

function gitFixture(t) {
  const root = fixture(t);
  git(root, 'init', '--quiet');
  metadata(root);
  mkdirSync(join(root, '.pipelines', 'scripts'), { recursive: true });
  for (const filename of ['Get-ReadyNpmRelease.mjs', 'Get-ReleasePackages.mjs']) {
    copyFileSync(join(dirname(helperPath), filename), join(root, '.pipelines', 'scripts', filename));
  }
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '-m', 'Disposable release readiness fixture');
  return { root, head: git(root, 'rev-parse', 'HEAD') };
}

function expectedOutputs(selected = npmKeys) {
  return Object.fromEntries(npmKeys.flatMap(key => [
    [`${key}_needsRelease`, String(selected.includes(key))],
    [`${key}_releaseVersion`, versions[key]],
    [`${key}_productState`, key === 'socketio' ? 'Current' : 'Beta'],
  ]));
}

function outputEntries(stdout) {
  return [...stdout.matchAll(/^##vso\[task\.setvariable variable=([^;]+);isOutput=true\]([^\r\n]*)\r?$/gm)]
    .map(([, key, value]) => [key, value]);
}

function fetchSequence(responses, lines) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      assert.deepEqual(lines, [], 'No output may precede successful build refresh');
      const index = calls.length;
      calls.push(`${url.pathname}${url.search}`);
      assert.equal(calls[index], requestPaths[index]);
      assert.equal(options.method ?? 'GET', 'GET');
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      assert.equal(options.headers.Accept, 'application/json');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.ok(index < responses.length, 'Unexpected REST request');
      const body = responses[index];
      if (body instanceof Error) throw body;
      if (body instanceof Response) return body;
      return { ok: true, json: async () => {
        assert.deepEqual(lines, [], 'No output may precede response validation');
        return body;
      } };
    },
  };
}

function runNode(args, root, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root, env: isolatedEnv(root, env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Release readiness CLI timed out'));
    }, 15_000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); resolveResult({ code, stdout, stderr }); });
  });
}

// These local HTTP fixtures verify the REST adapter and CLI, not Azure-hosted execution.
async function protocolServer(t, responses) {
  const requests = [];
  const instance = createServer((request, response) => {
    const index = requests.length;
    requests.push({ method: request.method, url: request.url,
      authorization: request.headers.authorization, accept: request.headers.accept });
    response.setHeader('Content-Type', 'application/json');
    if (request.method !== 'GET' || request.url !== requestPaths[index]) {
      response.writeHead(404);
      response.end('{}');
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401);
      response.end('{}');
      return;
    }
    const step = responses[index];
    response.statusCode = step?.status ?? 200;
    response.end(step?.raw ?? JSON.stringify(step?.body ?? null));
  });
  await new Promise((resolveServer, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', resolveServer);
  });
  t.after(() => new Promise(resolveServer => {
    instance.close(resolveServer);
    instance.closeAllConnections();
  }));
  return { requests, collection: `http://127.0.0.1:${instance.address().port}/collection/` };
}

function assertRequests(requests, count) {
  assert.deepEqual(requests, requestPaths.slice(0, count).map(url => ({
    method: 'GET', url, authorization: `Bearer ${token}`, accept: 'application/json',
  })));
}

test('artifact names are the immutable npm build contract, without emulator artifacts', () => {
  assert.deepEqual(NPM_ARTIFACTS, {
    chat_client: 'drop_web-pubsub-chat-client', socketio: 'drop_webpubsub-socketio-extension', tunnel: 'drop_awps-tunnel',
  });
  assert.equal(Object.isFrozen(NPM_ARTIFACTS), true);
});

test('all 4^3 npm stage outcomes select only successful builds and reject no selection', async t => {
  const outcomes = ['succeeded', 'skipped', 'failed', 'canceled'];
  let accepted = 0;
  let rejected = 0;
  for (const chat_client of outcomes) for (const socketio of outcomes) for (const tunnel of outcomes) {
    const results = { chat_client, socketio, tunnel };
    await t.test(Object.values(results).join('/'), () => {
      const data = timeline(Object.fromEntries(npmKeys.map(key => [`${key}_build`, { result: results[key] }])));
      const selected = npmKeys.filter(key => results[key] === 'succeeded');
      if (Object.values(results).every(result => ['succeeded', 'skipped'].includes(result)) && selected.length) {
        assert.deepEqual(readyPackages(data, artifacts(selected)), Object.fromEntries(npmKeys.map(key => [key, selected.includes(key)])));
        accepted++;
      } else {
        assert.throws(() => readyPackages(data, artifacts(selected)),
          selected.length === 0 && Object.values(results).every(result => result === 'skipped')
            ? /no npm packages to release/ : /build did not succeed/);
        rejected++;
      }
    });
  }
  assert.equal(accepted, 7);
  assert.equal(rejected, 57);
});

test('every required stage must have exactly one completed Stage record', async t => {
  for (const identifier of requiredStages) {
    const mutations = {
      missing: data => { data.records = data.records.filter(record => record.identifier !== identifier); },
      duplicate: data => { data.records.push({ ...data.records.find(record => record.identifier === identifier) }); },
      'duplicate pending attempt': data => { data.records.push({ type: 'Stage', identifier, state: 'pending', attempt: 2 }); },
      'display name only': data => { Object.assign(data.records.find(record => record.identifier === identifier), { identifier: undefined, name: identifier }); },
      'wrong identifier case': data => { data.records.find(record => record.identifier === identifier).identifier = identifier.toUpperCase(); },
      'Job instead of Stage': data => { data.records.find(record => record.identifier === identifier).type = 'Job'; },
      'lowercase stage type': data => { data.records.find(record => record.identifier === identifier).type = 'stage'; },
      'missing type': data => { delete data.records.find(record => record.identifier === identifier).type; },
    };
    for (const state of [undefined, null, 'pending', 'inProgress', 'Completed', 'COMPLETED', 'unknown', 2]) {
      mutations[`state ${String(state)}`] = data => { data.records.find(record => record.identifier === identifier).state = state; };
    }
    for (const [name, mutate] of Object.entries(mutations)) {
      await t.test(`${identifier}: ${name}`, () => {
        const data = timeline();
        mutate(data);
        assert.throws(() => readyPackages(data, artifacts()), new RegExp(`${identifier} has not completed successfully`));
      });
    }
  }
});

test('missing and malformed timeline envelopes or records fail closed', () => {
  for (const data of [undefined, null, {}, [], { records: null }, { records: {} }, { records: 'completed' },
    ...[null, undefined, false, 0, 'Stage'].map(record => ({ records: [...timeline().records, record] }))]) {
    assert.throws(() => readyPackages(data, artifacts()), /Invalid build timeline/, JSON.stringify(data));
  }
  for (const record of [{}, [], { type: 'Stage' }, { identifier: 'release_check' }]) {
    assert.throws(() => readyPackages({ records: [record, ...timeline().records.slice(1)] }, artifacts()), /release_check/);
  }
});

test('release_check must succeed, never skip, fail, cancel, or partially succeed', () => {
  for (const result of [undefined, null, 'skipped', 'failed', 'canceled', 'abandoned', 'partiallySucceeded',
    'succeededWithIssues', 'Succeeded', 'SUCCEEDED', 'none', 0]) {
    assert.throws(() => readyPackages(timeline({ release_check: { result } }), artifacts()), /Release checks did not succeed/);
  }
});

test('npm results use exact REST enum spelling and reject partial or unknown success', () => {
  for (const key of npmKeys) {
    for (const result of [undefined, null, 'Succeeded', 'Skipped', 'SUCCEEDED', 'SKIPPED',
      'partiallySucceeded', 'succeededWithIssues', 'abandoned', 'none', 'unknown', true, 0]) {
      assert.throws(() => readyPackages(timeline({ [`${key}_build`]: { result } }), artifacts()), new RegExp(`${key} build did not succeed`));
    }
  }
});

test('failed emulator/MyGet and pending or rejected manual stages do not block ready npm builds', () => {
  const data = timeline({ socketio_build: { result: 'skipped' } });
  data.records.push(
    { type: 'Stage', identifier: 'emulator_build', state: 'completed', result: 'failed' },
    { type: 'Stage', identifier: 'emulator_myget', state: 'completed', result: 'failed' },
    { type: 'Stage', identifier: 'Prod_npm_release', state: 'pending', result: null },
    { type: 'Stage', identifier: 'previous_manual_release', state: 'completed', result: 'failed' },
    { type: 'Checkpoint.Approval', identifier: 'npm_approval', state: 'completed', result: 'rejected' },
    ...requiredStages.map(identifier => ({ type: 'Job', identifier, state: 'pending' })),
  );
  assert.deepEqual(readyPackages(data, artifacts(['chat_client', 'tunnel'])), { chat_client: true, socketio: false, tunnel: true });
});

test('selected artifacts must uniquely exist with exact name and PipelineArtifact resource type', async t => {
  for (const key of npmKeys) {
    const invalid = {
      missing: [],
      duplicate: [...artifacts([key]).value, ...artifacts([key]).value],
      'duplicate wrong type': [...artifacts([key]).value, { name: NPM_ARTIFACTS[key], resource: { type: 'Container' } }],
      'wrong name case': [{ name: NPM_ARTIFACTS[key].toUpperCase(), resource: { type: 'PipelineArtifact' } }],
      'missing resource': [{ name: NPM_ARTIFACTS[key] }],
      'null resource': [{ name: NPM_ARTIFACTS[key], resource: null }],
      ...Object.fromEntries([undefined, null, '', 'Container', 'pipelineArtifact', 'pipelineartifact', 'Pipelineartifact', 1]
        .map(type => [`resource type ${String(type)}`, [{ name: NPM_ARTIFACTS[key], resource: { type } }]])),
    };
    const data = timeline(Object.fromEntries(npmKeys.map(name => [`${name}_build`, { result: name === key ? 'succeeded' : 'skipped' }])));
    for (const [name, value] of Object.entries(invalid)) {
      await t.test(`${key}: ${name}`, () => {
        assert.throws(() => readyPackages(data, { value }), new RegExp(`Missing validated pipeline artifact: ${NPM_ARTIFACTS[key]}`));
      });
    }
  }
});

test('malformed artifact envelopes fail, while unrelated artifacts never select skipped packages', () => {
  for (const value of [undefined, null, {}, [], { value: null }, { value: {} }, { value: 'artifacts' }]) {
    assert.throws(() => readyPackages(timeline(), value), /Invalid build artifacts response/);
  }
  const data = timeline({ socketio_build: { result: 'skipped' }, tunnel_build: { result: 'skipped' } });
  const available = artifacts(['chat_client']);
  available.value.push(null, {}, { name: 'unrelated', resource: { type: 'Container' } },
    ...artifacts(['socketio', 'socketio', 'tunnel']).value);
  assert.deepEqual(readyPackages(data, available), { chat_client: true, socketio: false, tunnel: false });
  assert.throws(() => readyPackages(timeline(Object.fromEntries(npmKeys.map(key => [`${key}_build`, { result: 'skipped' }]))), artifacts()), /no npm packages/);
});

test('same-build validation permits exact main/release sources and current noncanceled states', () => {
  for (const sourceBranch of ['refs/heads/main', 'refs/heads/release/1.2', 'refs/heads/release/npm/hotfix']) {
    for (const status of ['inProgress', 'completed']) {
      for (const result of [undefined, null, 'none', 'succeeded', 'partiallySucceeded', 'failed']) {
        const validate = () => assertSameBuild(build({ sourceBranch, status, result }), environment({ BUILD_SOURCEBRANCH: sourceBranch }));
        if (status === 'completed' && [undefined, null, 'none'].includes(result)) {
          assert.throws(validate, /not ready for release/);
        } else {
          assert.doesNotThrow(validate);
        }
      }
    }
  }
});

test('build ID, definition, branch, and commit mismatches or malformed identities fail closed', () => {
  for (const data of [undefined, null, {},
    ...[99, 101, '100', null, 100.5, Number.MAX_SAFE_INTEGER + 1].map(id => build({ id })),
    ...[undefined, null, {}, { id: 13 }, { id: '12' }, { id: 12.5 }, { id: Number.MAX_SAFE_INTEGER + 1 }].map(definition => build({ definition })),
    build({ sourceBranch: 'refs/heads/release/other' }), build({ sourceBranch: undefined }),
    ...[undefined, null, otherSha, sha.toUpperCase(), 'short', 1].map(sourceVersion => build({ sourceVersion })),
  ]) assert.throws(() => assertSameBuild(data, environment()), /exact main\/release-branch build and source commit/);
  for (const override of [{ BUILD_BUILDID: '99' }, { BUILD_BUILDID: '0100' }, { BUILD_BUILDID: 100 },
    { SYSTEM_DEFINITIONID: '13' }, { SYSTEM_DEFINITIONID: '012' }, { SYSTEM_DEFINITIONID: 12 },
    { BUILD_SOURCEVERSION: 'short' }, { BUILD_SOURCEVERSION: 'g'.repeat(40) }, { BUILD_SOURCEVERSION: '' }]) {
    assert.throws(() => assertSameBuild(build(), environment(override)), /exact main\/release-branch build and source commit/);
  }
});

test('PRs, test branches, tags, shorthand refs, and case variants cannot release even when build matches', () => {
  for (const sourceBranch of [undefined, null, '', 'main', 'release/1.2', 'refs/heads/Main', 'refs/heads/Release/1.2',
    'refs/heads/test', 'refs/heads/test/npm-release', 'refs/heads/feature/npm', 'refs/pull/123/merge',
    'refs/pull/123/head', 'refs/tags/release/1.2', 'refs/heads/releases/1.2', 'refs/heads/release/', 'refs/heads/main/other']) {
    assert.throws(() => assertSameBuild(build({ sourceBranch }), environment({ BUILD_SOURCEBRANCH: sourceBranch })), /exact main\/release-branch/);
  }
});

test('canceled, cancelling, pending, and wrongly cased build status/result enums are rejected', () => {
  for (const status of [undefined, null, 'cancelling', 'canceled', 'notStarted', 'postponed', 'none',
    'all', 'unknown', 'InProgress', 'inprogress', 'Completed', 2]) {
    assert.throws(() => assertSameBuild(build({ status }), environment()), /canceled or is not ready/);
  }
  for (const status of ['inProgress', 'completed']) {
    for (const result of ['canceled', 'cancelled', 'Canceled', 'Succeeded', 'Failed', 'PartiallySucceeded', 'NONE', 'unknown', '', 0]) {
      assert.throws(() => assertSameBuild(build({ status, result }), environment()), /canceled or is not ready/);
    }
  }
});

test('main refreshes the same build before emitting exactly nine intra-stage outputs', async t => {
  const { root, head } = gitFixture(t);
  const current = build({ sourceVersion: head, status: 'inProgress', result: 'failed' });
  const data = timeline({ socketio_build: { result: 'skipped' } });
  data.records.push({ type: 'Stage', identifier: 'emulator_myget', state: 'completed', result: 'failed' },
    { type: 'Stage', identifier: 'Prod_npm_release', state: 'pending' });
  const lines = [];
  const adapter = fetchSequence([current, data, artifacts(['chat_client', 'tunnel']), current], lines);
  const outputs = await main(environment({ BUILD_SOURCEVERSION: head }), { cwd: root, fetchImpl: adapter.fetchImpl, write: line => lines.push(line) });
  assert.deepEqual(adapter.calls, requestPaths);
  assert.deepEqual(outputs, expectedOutputs(['chat_client', 'tunnel']));
  assert.deepEqual(outputEntries(lines.join('\n')), Object.entries(outputs));
  assert.deepEqual(lines.filter(line => !line.startsWith('##vso[')), [
    `Ready: chat_client@${versions.chat_client} from build 100`, `Ready: tunnel@${versions.tunnel} from build 100`,
  ]);
  assert.equal(lines.length, 11);
});

test('main rejects initial or refreshed build identity/status failures without writing any outputs', async t => {
  const { root, head } = gitFixture(t);
  const current = build({ sourceVersion: head });
  const invalid = [null, {}, { ...current, id: 99 }, { ...current, definition: { id: 13 } },
    { ...current, sourceBranch: 'refs/heads/release/other' }, { ...current, sourceVersion: otherSha },
    { ...current, status: 'cancelling', result: null }, { ...current, result: 'canceled' },
    { ...current, status: 'Completed' }, { ...current, result: 'Succeeded' }];
  for (const phase of ['initial', 'refresh']) for (const [index, invalidBuild] of invalid.entries()) {
    await t.test(`${phase}: invalid build ${index}`, async () => {
      const lines = [];
      const responses = phase === 'initial' ? [invalidBuild] : [current, timeline(), artifacts(), invalidBuild];
      const adapter = fetchSequence(responses, lines);
      await assert.rejects(main(environment({ BUILD_SOURCEVERSION: head }), {
        cwd: root, fetchImpl: adapter.fetchImpl, write: line => lines.push(line),
      }), /exact main\/release-branch|canceled or is not ready/);
      assert.deepEqual(lines, []);
      assert.equal(adapter.calls.length, responses.length);
    });
  }
});

test('main stops before refresh on timeline, selection, or artifact validation failure', async t => {
  const { root, head } = gitFixture(t);
  const current = build({ sourceVersion: head });
  const cases = [
    [null, artifacts(), /Invalid build timeline/],
    [timeline({ release_check: { result: 'failed' } }), artifacts(), /Release checks/],
    [timeline({ tunnel_build: { state: 'pending' } }), artifacts(), /tunnel_build/],
    [timeline({ socketio_build: { result: 'failed' } }), artifacts(), /socketio build/],
    [timeline(), { value: [] }, /Missing validated/],
    [timeline(), {}, /Invalid build artifacts/],
    [timeline(Object.fromEntries(npmKeys.map(key => [`${key}_build`, { result: 'skipped' }]))), artifacts(), /no npm packages/],
  ];
  for (const [data, available, error] of cases) {
    const lines = [];
    const adapter = fetchSequence([current, data, available], lines);
    await assert.rejects(main(environment({ BUILD_SOURCEVERSION: head }), {
      cwd: root, fetchImpl: adapter.fetchImpl, write: line => lines.push(line),
    }), error);
    assert.deepEqual(lines, []);
    assert.equal(adapter.calls.length, 3);
  }
});

test('HEAD and all package metadata must match before making any REST requests or writing outputs', async t => {
  const { root, head } = gitFixture(t);
  const lines = [];
  const options = { cwd: root, fetchImpl: () => assert.fail('Invalid checkout must not request REST'), write: line => lines.push(line) };
  await assert.rejects(main(environment({ BUILD_SOURCEVERSION: otherSha }), options), /HEAD does not match BUILD_SOURCEVERSION/);
  for (const key of Object.keys(PACKAGES)) {
    put(root, `${PACKAGES[key].folder}/CHANGELOG.md`, '## [9.9.9]\n');
    await assert.rejects(main(environment({ BUILD_SOURCEVERSION: head }), options), new RegExp(`${key}:.*does not equal`));
    metadata(root);
  }
  put(root, `${PACKAGES.tunnel.folder}/package.json`, '{invalid-json');
  await assert.rejects(main(environment({ BUILD_SOURCEVERSION: head }), options), /tunnel:/);
  assert.deepEqual(lines, []);
});

test('HTTP, malformed JSON, and network failures at any preflight request emit no partial outputs', async t => {
  const { root, head } = gitFixture(t);
  const current = build({ sourceVersion: head });
  for (let index = 0; index < 4; index++) {
    for (const failure of [new Response(null, { status: 401 }), new Response('{invalid-json'), new Error('local protocol network failure')]) {
      const lines = [];
      const responses = [current, timeline(), artifacts(), current].slice(0, index + 1);
      responses[index] = failure;
      const adapter = fetchSequence(responses, lines);
      await assert.rejects(main(environment({ BUILD_SOURCEVERSION: head }), {
        cwd: root, fetchImpl: adapter.fetchImpl, write: line => lines.push(line),
      }), /Azure DevOps .* request failed/);
      assert.deepEqual(lines, []);
      assert.equal(adapter.calls.length, index + 1);
    }
  }
});

test('real CLI verifies same-build GET paths, token, selected versions, and release-branch retries', async t => {
  const { root, head } = gitFixture(t);
  for (const [branch, selected] of [['refs/heads/main', npmKeys], ['refs/heads/release/1.2', ['chat_client', 'tunnel']]]) {
    await t.test(branch, async child => {
      const current = build({ sourceVersion: head, sourceBranch: branch, status: 'inProgress', result: 'failed' });
      const data = timeline(Object.fromEntries(npmKeys.map(key => [`${key}_build`, { result: selected.includes(key) ? 'succeeded' : 'skipped' }])));
      data.records.push({ type: 'Stage', identifier: 'emulator_build', state: 'completed', result: 'failed' },
        { type: 'Stage', identifier: 'emulator_myget', state: 'completed', result: 'failed' },
        { type: 'Stage', identifier: 'Prod_npm_release', state: 'pending', result: null });
      const http = await protocolServer(child, [current, data, artifacts(selected), current].map(body => ({ body })));
      const result = await runNode([join('.pipelines', 'scripts', 'Get-ReadyNpmRelease.mjs')], root, environment({
        SYSTEM_COLLECTIONURI: http.collection, BUILD_SOURCEVERSION: head, BUILD_SOURCEBRANCH: branch,
        BUILD_SOURCESDIRECTORY: join(root, 'not-the-checkout'),
      }));
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stderr, '');
      assertRequests(http.requests, 4);
      assert.deepEqual(outputEntries(result.stdout), Object.entries(expectedOutputs(selected)));
      assert.deepEqual(result.stdout.trim().split(/\r?\n/).filter(line => !line.startsWith('##vso[')),
        selected.map(key => `Ready: ${key}@${versions[key]} from build 100`));
      assert.doesNotMatch(result.stdout, /emulator_|previewVersion|stageDependencies|dependencies\[/);
    });
  }
});

test('real CLI failures are nonzero with no output variables, including cancellation at refresh', async t => {
  const { root, head } = gitFixture(t);
  const current = build({ sourceVersion: head });
  const valid = [current, timeline(), artifacts(), current].map(body => ({ body }));
  const cases = [
    { name: 'wrong build ID', index: 0, body: { ...current, id: 99 }, error: /exact main\/release-branch/ },
    { name: 'wrong definition', index: 0, body: { ...current, definition: { id: 13 } }, error: /exact main\/release-branch/ },
    { name: 'wrong branch', index: 0, body: { ...current, sourceBranch: 'refs/heads/release/other' }, error: /exact main\/release-branch/ },
    { name: 'wrong commit', index: 0, body: { ...current, sourceVersion: otherSha }, error: /exact main\/release-branch/ },
    { name: 'PR build', index: 0, body: { ...current, sourceBranch: 'refs/pull/1/merge' }, env: { BUILD_SOURCEBRANCH: 'refs/pull/1/merge' }, error: /exact main\/release-branch/ },
    { name: 'test branch', index: 0, body: { ...current, sourceBranch: 'refs/heads/test/npm' }, env: { BUILD_SOURCEBRANCH: 'refs/heads/test/npm' }, error: /exact main\/release-branch/ },
    { name: 'release check failed', index: 1, body: timeline({ release_check: { result: 'failed' } }), error: /Release checks/, count: 3 },
    { name: 'npm still pending', index: 1, body: timeline({ tunnel_build: { state: 'pending' } }), error: /tunnel_build/, count: 3 },
    { name: 'nothing selected', index: 1, body: timeline(Object.fromEntries(npmKeys.map(key => [`${key}_build`, { result: 'skipped' }]))), error: /no npm packages/, count: 3 },
    { name: 'artifact missing', index: 2, body: artifacts(['chat_client', 'socketio']), error: /Missing validated/ },
    { name: 'artifact duplicated', index: 2, body: artifacts([...npmKeys, 'tunnel']), error: /Missing validated/ },
    { name: 'artifact is Container', index: 2, body: { value: artifacts().value.map(item => ({ ...item, resource: { type: 'Container' } })) }, error: /Missing validated/ },
    { name: 'cancelling on refresh', index: 3, body: { ...current, status: 'cancelling', result: null }, error: /canceled or is not ready/ },
    { name: 'canceled on refresh', index: 3, body: { ...current, result: 'canceled' }, error: /canceled or is not ready/ },
    { name: 'HTTP forbidden', index: 2, status: 403, body: {}, error: /HTTP 403/ },
    { name: 'malformed timeline JSON', index: 1, raw: '{invalid-json', error: /request failed/ },
  ];
  for (const item of cases) {
    await t.test(item.name, async child => {
      const responses = [...valid];
      responses[item.index] = item;
      const http = await protocolServer(child, responses);
      const result = await runNode([join('.pipelines', 'scripts', 'Get-ReadyNpmRelease.mjs')], root, environment({
        SYSTEM_COLLECTIONURI: http.collection, BUILD_SOURCEVERSION: head, ...item.env,
      }));
      assert.equal(result.code, 1, result.stderr);
      assert.match(result.stderr, /^npm release blocked:/);
      assert.match(result.stderr, item.error);
      assert.equal(result.stdout, '');
      assert.deepEqual(outputEntries(result.stdout), []);
      assert.doesNotMatch(result.stderr, /##vso\[|local-release-test-token/);
      assertRequests(http.requests, item.count ?? item.index + 1);
    });
  }
});

test('real CLI rejects checkout, metadata, and missing-token failures without HTTP requests', async t => {
  const { root, head } = gitFixture(t);
  const http = await protocolServer(t, []);
  const env = environment({ SYSTEM_COLLECTIONURI: http.collection, BUILD_SOURCEVERSION: head });
  const args = [join('.pipelines', 'scripts', 'Get-ReadyNpmRelease.mjs')];
  for (const [override, pattern] of [
    [{ BUILD_SOURCEVERSION: otherSha }, /HEAD does not match/],
    [{ SYSTEM_ACCESSTOKEN: '' }, /Missing SYSTEM_ACCESSTOKEN/],
  ]) {
    const result = await runNode(args, root, { ...env, ...override });
    assert.equal(result.code, 1);
    assert.match(result.stderr, pattern);
    assert.equal(result.stdout, '');
  }
  put(root, `${PACKAGES.socketio.folder}/CHANGELOG.md`, '## [9.9.9]\n');
  const result = await runNode(args, root, env);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /socketio:.*does not equal/);
  assert.equal(result.stdout, '');
  assert.deepEqual(http.requests, []);
});

test('node --input-type=module import has no CLI side effects with no argv[1] or Azure configuration', async t => {
  const root = fixture(t);
  for (const filename of ['Get-ReadyNpmRelease.mjs', 'Get-ReleasePackages.mjs']) {
    copyFileSync(join(dirname(helperPath), filename), join(root, filename));
  }
  const result = await runNode(['--input-type=module', '--eval', `
    if (process.argv[1] !== undefined) throw new Error('Expected no argv[1]');
    globalThis.fetch = () => { throw new Error('Import must not request REST'); };
    const helper = await import(${JSON.stringify(pathToFileURL(join(root, 'Get-ReadyNpmRelease.mjs')).href)});
    if (typeof helper.main !== 'function') throw new Error('Expected exported main');
  `], root, environment({ SYSTEM_COLLECTIONURI: '', SYSTEM_ACCESSTOKEN: '', BUILD_BUILDID: '', BUILD_SOURCEVERSION: '' }));
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
