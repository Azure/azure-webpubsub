import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run from the repository root in release_check / check / read, with fetchDepth: 0.
// All outputs are emitted only after metadata, history, and REST checks succeed.
const COMMON_INPUTS = Object.freeze([
  '.pipelines/**',
  'package.json',
  'yarn.lock',
  'package-lock.json',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.node-version',
  '.nvmrc',
  '.gitignore',
  '.gitattributes',
  '.prettierrc',
  'LICENSE',
]);

export const PACKAGES = Object.freeze({
  emulator: Object.freeze({ folder: 'tools/emulator', metadata: 'version.props' }),
  chat_client: Object.freeze({ folder: 'sdk/webpubsub-chat-client', metadata: 'package.json' }),
  socketio: Object.freeze({ folder: 'sdk/webpubsub-socketio-extension', metadata: 'package.json' }),
  tunnel: Object.freeze({ folder: 'tools/awps-tunnel/server', metadata: 'package.json' }),
});

// Directory-wide inputs intentionally include tests/docs and future build inputs.
// Socket.IO currently restores the tunnel client, so tunnel inputs affect both.
export const PACKAGE_INPUTS = Object.freeze({
  emulator: Object.freeze([
    ...COMMON_INPUTS,
    'tools/emulator/**',
    'protocols/protobuf.webpubsub.azure.v1/**',
    'microsoft.png',
    'global.json',
    'NuGet.Config',
    'nuget.config',
    'Directory.Build.props',
    'Directory.Build.targets',
    'Directory.Packages.props',
  ]),
  chat_client: Object.freeze([...COMMON_INPUTS, 'sdk/webpubsub-chat-client/**']),
  socketio: Object.freeze([
    ...COMMON_INPUTS,
    'sdk/webpubsub-socketio-extension/**',
    'sdk/server-proxies/**',
    'tools/awps-tunnel/**',
  ]),
  tunnel: Object.freeze([...COMMON_INPUTS, 'tools/awps-tunnel/**', 'sdk/server-proxies/**']),
});

// The root pipeline's trigger.paths.include must contain this union.
export const TRIGGER_PATHS = Object.freeze([...new Set(Object.values(PACKAGE_INPUTS).flat())]);
export const AUTOMATIC_STAGES = Object.freeze([
  'release_check',
  'emulator_build',
  'emulator_myget',
  'chat_client_build',
  'socketio_build',
  'tunnel_build',
]);
export const REQUEST_TIMEOUT_MS = 30_000;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta\.(0|[1-9]\d*))?$/;
const COMMIT = /^[a-f0-9]{40}$/i;

export function validateVersion(version) {
  if (typeof version !== 'string' || !VERSION.test(version)) {
    throw new Error(`Unsupported release version: ${JSON.stringify(version)}`);
  }
  return version;
}

export function readChangelogVersion(changelog) {
  for (const line of changelog.split(/\r?\n/)) {
    const heading = /^##[\t ]+\[([^\]\r\n]+)\](?:[\t ].*)?$/.exec(line);
    if (!heading || heading[1] === 'Unreleased') continue;
    return validateVersion(heading[1]);
  }
  throw new Error('No bracketed release version heading in CHANGELOG.md');
}

export function readEmulatorVersion(xml) {
  // This file declares literals, not evaluated MSBuild expressions. Reject changes
  // to that contract rather than guessing which conditional/duplicate value wins.
  const literal = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*<\?xml[^?]*\?>/, '').trim();
  const props = /^<Project>\s*<PropertyGroup>\s*<VersionPrefix>([^<>]*)<\/VersionPrefix>\s*(?:<VersionSuffix>([^<>]*)<\/VersionSuffix>|<VersionSuffix\s*\/>)?\s*<\/PropertyGroup>\s*<\/Project>$/.exec(literal);
  if (!props) throw new Error('version.props must declare one literal VersionPrefix and optional VersionSuffix');
  const prefix = validateVersion(props[1].trim());
  if (prefix.includes('-')) throw new Error('VersionPrefix must be a stable version');
  const suffix = props[2]?.trim();
  return validateVersion(suffix ? `${prefix}-${suffix}` : prefix);
}

function positiveId(value, label) {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Number(text);
}

export function previewVersion(version, buildId) {
  return `${validateVersion(version)}-preview-${positiveId(buildId, 'BUILD_BUILDID')}`;
}

export function readPackageVersions(repoRoot) {
  return Object.fromEntries(Object.entries(PACKAGES).map(([key, pkg]) => {
    const folder = join(repoRoot, pkg.folder);
    try {
      const version = readChangelogVersion(readFileSync(join(folder, 'CHANGELOG.md'), 'utf8'));
      const metadata = readFileSync(join(folder, pkg.metadata), 'utf8');
      const declared = pkg.metadata === 'version.props'
        ? readEmulatorVersion(metadata)
        : validateVersion(JSON.parse(metadata).version);
      if (declared !== version) {
        throw new Error(`CHANGELOG.md version ${version} does not equal ${pkg.metadata} version ${declared}`);
      }
      return [key, { releaseVersion: version, productState: version.includes('-beta.') ? 'Beta' : 'Current' }];
    } catch (error) {
      throw new Error(`${key}: ${error.message}`, { cause: error });
    }
  }));
}

export function affectedPackages(files, allPackages = false) {
  return Object.fromEntries(Object.entries(PACKAGE_INPUTS).map(([key, inputs]) => [
    key,
    allPackages || files.some(file => inputs.some(input => input.endsWith('/**')
      ? file.startsWith(input.slice(0, -2))
      : file === input)),
  ]));
}

function git(repoRoot, args, allowed = [0]) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: REQUEST_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || !allowed.includes(result.status)) {
    throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim() ?? result.status}`);
  }
  return result;
}

export function getChangedFiles(repoRoot, baseline, head = 'HEAD') {
  if (git(repoRoot, ['rev-parse', '--is-shallow-repository']).stdout.trim() !== 'false') {
    throw new Error('Release checks require full Git history; checkout with fetchDepth: 0');
  }
  const headCommit = git(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${head}^{commit}`]).stdout.trim();
  const all = reason => ({ allPackages: true, files: [], reason });
  if (!baseline) return all('No valid recent automatic baseline; selecting all packages');
  const base = git(repoRoot, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${baseline}^{commit}`], [0, 1]);
  if (base.status === 1) return all('Baseline commit is missing locally; selecting all packages');
  const baseCommit = base.stdout.trim();
  const ancestor = git(repoRoot, ['merge-base', '--is-ancestor', baseCommit, headCommit], [0, 1]);
  if (ancestor.status === 1) return all('Baseline is not an ancestor of the current commit; selecting all packages');
  const output = git(repoRoot, ['diff', '--no-renames', '--name-only', '-z', baseCommit, headCommit, '--']).stdout;
  if (output && !output.endsWith('\0')) throw new Error('git diff returned incomplete NUL-delimited output');
  return {
    allPackages: false,
    files: output ? output.slice(0, -1).split('\0') : [],
    reason: `Comparing automatic baseline ${baseCommit} to ${headCommit}`,
  };
}

export function automaticStagesSucceeded(timeline) {
  if (!Array.isArray(timeline?.records) || timeline.records.some(record => !record || typeof record !== 'object')) {
    return false;
  }
  return AUTOMATIC_STAGES.every(identifier => {
    // Display names are localized/editable. Only the stable YAML identifier counts.
    const stages = timeline.records.filter(record => record.type === 'Stage' && record.identifier === identifier);
    return stages.length === 1 && stages[0].state === 'completed'
      && (stages[0].result === 'succeeded' || (identifier !== 'release_check' && stages[0].result === 'skipped'));
  });
}

function required(env, name) {
  if (typeof env[name] !== 'string' || !env[name].trim() || env[name].includes('$(')) {
    throw new Error(`Missing ${name}`);
  }
  return env[name];
}

export function createAdoClient(env, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const collection = new URL(required(env, 'SYSTEM_COLLECTIONURI'));
  if (!['https:', 'http:'].includes(collection.protocol) || collection.username || collection.password || collection.search || collection.hash) {
    throw new Error('Invalid SYSTEM_COLLECTIONURI');
  }
  const project = env.SYSTEM_TEAMPROJECT || required(env, 'SYSTEM_TEAMPROJECTID');
  const definitionId = positiveId(required(env, 'SYSTEM_DEFINITIONID'), 'SYSTEM_DEFINITIONID');
  const branch = required(env, 'BUILD_SOURCEBRANCH');
  const token = required(env, 'SYSTEM_ACCESSTOKEN');
  const base = `${collection.href.replace(/\/$/, '')}/${encodeURIComponent(project)}/_apis/build/builds`;

  async function get(path = '', query = {}, readHeaders = () => {}) {
    const url = new URL(`${base}${path}`);
    url.search = new URLSearchParams({ ...query, 'api-version': '7.1' }).toString();
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      readHeaders(response.headers);
      return await response.json();
    } catch (error) {
      // Do not log authentication headers or response bodies (which may contain secrets).
      const operation = path.endsWith('/timeline') ? 'timeline' : 'builds';
      throw new Error(`Azure DevOps ${operation} request failed: ${error.name === 'TimeoutError' ? 'timed out' : error.message}`, { cause: error });
    }
  }

  return {
    async listBuilds(beforeBuildId = env.BUILD_BUILDID) {
      const currentId = positiveId(beforeBuildId, 'BUILD_BUILDID');
      const builds = new Map();
      const seenTokens = new Set();
      let continuationToken;
      do {
        let nextToken;
        const response = await get('', {
          definitions: String(definitionId),
          branchName: branch,
          '$top': '25',
          queryOrder: 'queueTimeDescending',
          ...(continuationToken ? { continuationToken } : {}),
        }, headers => { nextToken = headers?.get('x-ms-continuationtoken'); });
        if (!Array.isArray(response?.value)) throw new Error('Invalid Azure DevOps builds response');
        for (const build of response.value) {
          if (build && Number.isSafeInteger(build.id) && build.id > 0 && build.id < currentId
            && build.definition?.id === definitionId && build.sourceBranch === branch) {
            builds.set(build.id, build);
          }
        }
        if (builds.size >= 25 || !nextToken) break;
        if (seenTokens.has(nextToken)) throw new Error('Azure DevOps builds pagination did not advance');
        seenTokens.add(nextToken);
        continuationToken = nextToken;
      } while (continuationToken);
      return [...builds.values()].slice(0, 25);
    },
    getTimeline(buildId) {
      return get(`/${positiveId(buildId, 'build ID')}/timeline`);
    },
    getBuild(buildId) {
      return get(`/${positiveId(buildId, 'build ID')}`);
    },
  };
}

export async function findAutomaticBaseline(client, { definitionId, sourceBranch, buildId }) {
  const currentId = positiveId(buildId, 'BUILD_BUILDID');
  const definition = positiveId(definitionId, 'SYSTEM_DEFINITIONID');
  // BuildStatus/BuildResult are documented by the Build REST API. Cancellation
  // can make affected stages look completed/skipped; a timeline alone is insufficient.
  const eligible = build => build && Number.isSafeInteger(build.id) && build.id > 0
    && build.id < currentId && build.definition?.id === definition && build.sourceBranch === sourceBranch
    && typeof build.sourceVersion === 'string' && COMMIT.test(build.sourceVersion)
    && ['inProgress', 'completed'].includes(build.status)
    && (['succeeded', 'partiallySucceeded', 'failed'].includes(build.result)
      || (build.status === 'inProgress' && [undefined, null, 'none'].includes(build.result)));
  const builds = await client.listBuilds(currentId);
  const candidates = builds.filter(eligible).sort((a, b) => b.id - a.id);
  for (const build of candidates) {
    if (!automaticStagesSucceeded(await client.getTimeline(build.id))) continue;
    // Refresh after reading the timeline to detect cancellation that became visible
    // after the list snapshot, before accepting any skipped automatic work.
    const refreshed = await client.getBuild(build.id);
    if (eligible(refreshed) && refreshed.id === build.id && refreshed.sourceVersion === build.sourceVersion) {
      return build.sourceVersion;
    }
  }
  return null;
}

export function releaseOutputs(versions, affected, buildId) {
  const outputs = {};
  for (const key of Object.keys(PACKAGES)) {
    outputs[`${key}_needsRelease`] = String(affected[key]);
    outputs[`${key}_releaseVersion`] = versions[key].releaseVersion;
    outputs[`${key}_productState`] = versions[key].productState;
  }
  outputs.emulator_previewVersion = previewVersion(versions.emulator.releaseVersion, buildId);
  outputs.anyChanged = String(Object.values(affected).some(Boolean));
  return outputs;
}

export function emitOutputs(outputs, write = console.log) {
  for (const [name, value] of Object.entries(outputs)) {
    const escaped = String(value).replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    write(`##vso[task.setvariable variable=${name};isOutput=true]${escaped}`);
  }
}

export async function main(env = process.env, { fetchImpl, write = console.log, cwd = process.cwd() } = {}) {
  // ADO may report the shared sources directory rather than a custom checkout path.
  const repoRoot = resolve(cwd);
  const head = required(env, 'BUILD_SOURCEVERSION');
  if (!COMMIT.test(head)) throw new Error('BUILD_SOURCEVERSION must be a full Git commit SHA');
  const currentId = positiveId(required(env, 'BUILD_BUILDID'), 'BUILD_BUILDID');
  if (git(repoRoot, ['rev-parse', 'HEAD']).stdout.trim().toLowerCase() !== head.toLowerCase()) {
    throw new Error('Checked-out HEAD does not match BUILD_SOURCEVERSION');
  }
  const versions = readPackageVersions(repoRoot);
  const client = createAdoClient(env, { fetchImpl });
  const baseline = await findAutomaticBaseline(client, {
    definitionId: env.SYSTEM_DEFINITIONID,
    sourceBranch: env.BUILD_SOURCEBRANCH,
    buildId: currentId,
  });
  const change = getChangedFiles(repoRoot, baseline, head);
  const outputs = releaseOutputs(versions, affectedPackages(change.files, change.allPackages), currentId);
  write(change.reason);
  emitOutputs(outputs, write);
  return outputs;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`Release check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
