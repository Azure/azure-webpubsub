import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAdoClient, emitOutputs, readPackageVersions, REQUEST_TIMEOUT_MS } from './Get-ReleasePackages.mjs';

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
  if (!allowedBranch || !/^[a-f0-9]{40}$/i.test(env.BUILD_SOURCEVERSION ?? '')
    || !Number.isSafeInteger(build?.id) || String(build.id) !== env.BUILD_BUILDID
    || !Number.isSafeInteger(build?.definition?.id) || String(build.definition.id) !== env.SYSTEM_DEFINITIONID
    || build.sourceBranch !== env.BUILD_SOURCEBRANCH || build.sourceVersion !== env.BUILD_SOURCEVERSION) {
    throw new Error('Release must use this exact main/release-branch build and source commit.');
  }
  // Starting the manual stage reopens the run; prior manual failures may be retried.
  const finishedResult = ['succeeded', 'partiallySucceeded', 'failed'].includes(build.result);
  if (!((build.status === 'completed' && finishedResult)
    || (build.status === 'inProgress' && (finishedResult || [undefined, null, 'none'].includes(build.result))))) {
    throw new Error('The build is canceled or is not ready for release.');
  }
}

export async function main(env = process.env, { fetchImpl, write = console.log, cwd = process.cwd() } = {}) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd, encoding: 'utf8', timeout: REQUEST_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (head !== env.BUILD_SOURCEVERSION) throw new Error('Checked-out HEAD does not match BUILD_SOURCEVERSION.');
  const versions = readPackageVersions(cwd);
  const client = createAdoClient(env, { fetchImpl });
  assertSameBuild(await client.getBuild(env.BUILD_BUILDID), env);
  const timeline = await client.getTimeline(env.BUILD_BUILDID);
  const artifacts = await client.getArtifacts(env.BUILD_BUILDID);
  const selected = readyPackages(timeline, artifacts);
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
  main().catch(error => {
    console.error(`npm release blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
