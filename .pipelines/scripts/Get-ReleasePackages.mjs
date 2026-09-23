import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACKAGES = Object.freeze({
  emulator: Object.freeze({ folder: 'tools/emulator', metadata: 'version.props' }),
  chat_client: Object.freeze({ folder: 'sdk/webpubsub-chat-client', metadata: 'package.json' }),
  socketio: Object.freeze({ folder: 'sdk/webpubsub-socketio-extension', metadata: 'package.json' }),
  tunnel: Object.freeze({ folder: 'tools/awps-tunnel/server', metadata: 'package.json' }),
});

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta\.(0|[1-9]\d*))?$/;

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

export function readPackageVersions(repoRoot, packageKeys = Object.keys(PACKAGES)) {
  for (const key of packageKeys) {
    if (!Object.hasOwn(PACKAGES, key)) throw new Error(`Unknown package: ${key}`);
  }
  return Object.fromEntries(packageKeys.map(key => {
    const pkg = PACKAGES[key];
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

export function releaseOutputs(versions, buildId) {
  const outputs = {};
  for (const [key, version] of Object.entries(versions)) {
    outputs[`${key}_releaseVersion`] = version.releaseVersion;
    outputs[`${key}_productState`] = version.productState;
  }
  if (versions.emulator) {
    outputs.emulator_previewVersion = previewVersion(versions.emulator.releaseVersion, buildId);
  }
  return outputs;
}

export function emitOutputs(outputs, write = console.log) {
  for (const [name, value] of Object.entries(outputs)) {
    const escaped = String(value).replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    write(`##vso[task.setvariable variable=${name};isOutput=true]${escaped}`);
  }
}

export async function main(env = process.env, { write = console.log, cwd = process.cwd(), packageKeys } = {}) {
  const outputs = releaseOutputs(readPackageVersions(resolve(cwd), packageKeys), env.BUILD_BUILDID);
  emitOutputs(outputs, write);
  return outputs;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // No arguments checks all packages; builds pass only their own package key.
  main(process.env, { packageKeys: process.argv.length > 2 ? process.argv.slice(2) : undefined }).catch(error => {
    console.error(`Release check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
