import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAdoClient, emitOutputs, PACKAGES, readPackageVersions, REQUEST_TIMEOUT_MS } from './Get-ReleasePackages.mjs';

export const RELEASE_SOURCE_ARTIFACT = 'drop_release_source';
const SOURCE_MANIFEST = 'release-source.json';

function checkedOutHead(cwd, env) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd, encoding: 'utf8', timeout: REQUEST_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (head !== env.BUILD_SOURCEVERSION) throw new Error('Checked-out HEAD does not match BUILD_SOURCEVERSION.');
  return head;
}

export function prepareSourceArtifact(destination, env = process.env, cwd = process.cwd()) {
  const head = checkedOutHead(cwd, env);
  const source = {
    id: Number(env.BUILD_BUILDID), definition: { id: Number(env.SYSTEM_DEFINITIONID) },
    sourceBranch: env.BUILD_SOURCEBRANCH, sourceVersion: head,
  };
  assertBuildIdentity(source, env);
  const files = [
    '.pipelines/scripts/Get-ReadyNpmRelease.mjs', '.pipelines/scripts/Get-ReleasePackages.mjs',
    ...Object.values(PACKAGES).flatMap(pkg => [`${pkg.folder}/${pkg.metadata}`, `${pkg.folder}/CHANGELOG.md`]),
  ];
  // Copy only committed release inputs, never .git or persisted checkout credentials.
  for (const file of files) {
    const content = execFileSync('git', ['show', `${head}:${file}`], {
      cwd, timeout: REQUEST_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  readPackageVersions(destination);
  writeFileSync(join(destination, SOURCE_MANIFEST), JSON.stringify(source));
}

function assertBuildIdentity(build, env) {
  if (!/^[a-f0-9]{40}$/i.test(env.BUILD_SOURCEVERSION ?? '')
    || !Number.isSafeInteger(build?.id) || build.id <= 0 || String(build.id) !== env.BUILD_BUILDID
    || !Number.isSafeInteger(build?.definition?.id) || build.definition.id <= 0 || String(build.definition.id) !== env.SYSTEM_DEFINITIONID
    || typeof env.BUILD_SOURCEBRANCH !== 'string' || !env.BUILD_SOURCEBRANCH.startsWith('refs/heads/')
    || build.sourceBranch !== env.BUILD_SOURCEBRANCH || build.sourceVersion !== env.BUILD_SOURCEVERSION) {
    throw new Error('Release must use this exact main/release-branch build and source commit.');
  }
}

export const NPM_ARTIFACTS = Object.freeze({
  chat_client: 'drop_web-pubsub-chat-client',
  socketio: 'drop_webpubsub-socketio-extension',
  tunnel: 'drop_awps-tunnel',
});

export function readyPackages(timeline, artifacts) {
  if (!Array.isArray(timeline?.records) || timeline.records.some(record => !record || typeof record !== 'object')) {
    throw new Error('Invalid build timeline.');
  }
  const stage = identifier => {
    const matches = timeline.records.filter(record => record.type === 'Stage' && record.identifier === identifier);
    if (matches.length !== 1 || matches[0].state !== 'completed') {
      throw new Error(`${identifier} has not completed successfully. Wait for the automatic npm builds before starting release.`);
    }
    return matches[0];
  };
  if (stage('release_check').result !== 'succeeded') throw new Error('Release checks did not succeed.');
  if (!Array.isArray(artifacts?.value)) throw new Error('Invalid build artifacts response.');
  const selected = {};
  for (const [key, artifactName] of Object.entries(NPM_ARTIFACTS)) {
    const result = stage(`${key}_build`).result;
    if (!['succeeded', 'skipped'].includes(result)) throw new Error(`${key} build did not succeed.`);
    // Build stages are non-skippable by users and run only for affected packages.
    // Read their actual results, not output variables from unrelated manual stages.
    selected[key] = result === 'succeeded';
    if (selected[key]) {
      const matches = artifacts.value.filter(artifact => artifact?.name === artifactName);
      if (matches.length !== 1 || matches[0].resource?.type !== 'PipelineArtifact') {
        throw new Error(`Missing validated pipeline artifact: ${artifactName}`);
      }
    }
  }
  if (!Object.values(selected).some(Boolean)) throw new Error('This build has no npm packages to release.');
  return selected;
}

export function assertSameBuild(build, env) {
  const allowedBranch = env.BUILD_SOURCEBRANCH === 'refs/heads/main'
    || /^refs\/heads\/release\/.+/.test(env.BUILD_SOURCEBRANCH ?? '');
  assertBuildIdentity(build, env);
  if (!allowedBranch) throw new Error('Release must use this exact main/release-branch build and source commit.');
  // Starting the manual stage reopens the run; prior manual failures may be retried.
  const finishedResult = ['succeeded', 'partiallySucceeded', 'failed'].includes(build.result);
  if (!((build.status === 'completed' && finishedResult)
    || (build.status === 'inProgress' && (finishedResult || [undefined, null, 'none'].includes(build.result))))) {
    throw new Error('The build is canceled or is not ready for release.');
  }
}

export async function main(env = process.env, { fetchImpl, write = console.log, cwd = process.cwd(), fromArtifact = false } = {}) {
  if (fromArtifact) {
    assertBuildIdentity(JSON.parse(readFileSync(join(cwd, SOURCE_MANIFEST), 'utf8')), env);
  } else {
    checkedOutHead(cwd, env);
  }
  const versions = readPackageVersions(cwd);
  const client = createAdoClient(env, { fetchImpl });
  assertSameBuild(await client.getBuild(env.BUILD_BUILDID), env);
  const timeline = await client.getTimeline(env.BUILD_BUILDID);
  const artifacts = await client.getArtifacts(env.BUILD_BUILDID);
  const selected = readyPackages(timeline, artifacts);
  if (fromArtifact) {
    const sources = artifacts.value.filter(artifact => artifact?.name === RELEASE_SOURCE_ARTIFACT);
    if (sources.length !== 1 || sources[0].resource?.type !== 'PipelineArtifact') {
      throw new Error(`Missing validated pipeline artifact: ${RELEASE_SOURCE_ARTIFACT}`);
    }
  }
  assertSameBuild(await client.getBuild(env.BUILD_BUILDID), env);
  const outputs = {};
  for (const key of Object.keys(NPM_ARTIFACTS)) {
    outputs[`${key}_needsRelease`] = String(selected[key]);
    outputs[`${key}_releaseVersion`] = versions[key].releaseVersion;
    outputs[`${key}_productState`] = versions[key].productState;
    if (selected[key]) write(`Ready: ${key}@${versions[key].releaseVersion} from build ${env.BUILD_BUILDID}`);
  }
  emitOutputs(outputs, write);
  return outputs;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === '--prepare-artifact') {
      prepareSourceArtifact(resolve(args[1]));
    } else if (args.length === 0 || (args.length === 1 && args[0] === '--from-artifact')) {
      await main(process.env, { fromArtifact: args.length === 1 });
    } else {
      throw new Error('Usage: Get-ReadyNpmRelease.mjs [--from-artifact | --prepare-artifact <directory>]');
    }
  })().catch(error => {
    console.error(`npm release blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
