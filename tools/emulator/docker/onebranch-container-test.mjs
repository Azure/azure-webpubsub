// Run by OneBranch's Container Structure Test against the final runtime image.
// Node and these test scripts are mounted read-only, never added to the image.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

assert.ok(process.getuid() > 0, 'The runtime must run as a non-root user');
const sdks = spawnSync('dotnet', ['--list-sdks'], { encoding: 'utf8' });
assert.equal(sdks.status, 0, 'The .NET runtime must be available');
assert.equal(sdks.stdout.trim(), '', 'The runtime image must not contain an SDK');
const directory = await mkdtemp(join(tmpdir(), 'awps-smoke-'));
const helper = join(dirname(fileURLToPath(import.meta.url)), 'emulator-container-test.mjs');
const key = randomBytes(48).toString('base64');
const environment = { ...process.env, EMULATOR_TEST_ACCESS_KEY: key, WebPubSub__AccessKey: key, Urls: 'http://127.0.0.1:8081' };
const children = [];
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(new Error('Container smoke exceeded 120 seconds')), 120000);

function start(command, args) {
    const child = spawn(command, args, { cwd: directory, env: environment, signal: abort.signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', data => { output = (output + data).slice(-32768); });
    }
    const completed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => resolve(code));
    });
    // Background processes may fail while readiness is being checked.
    completed.catch(() => {});
    const entry = { child, completed, output: () => output.replaceAll(key, '[test access key]') };
    children.push(entry);
    return entry;
}

async function ready(url, entry, method = 'GET') {
    for (let attempt = 0; attempt < 120; attempt++) {
        abort.signal.throwIfAborted();
        assert.equal(entry.child.exitCode, null, entry.output());
        try {
            const response = await fetch(url, { method, signal: AbortSignal.timeout(1000) });
            await response.body?.cancel();
            if (response.ok) return;
        } catch { /* The process may still be starting. */ }
        await delay(250, undefined, { signal: abort.signal });
    }
    throw new Error(`Timed out waiting for ${url}: ${entry.output()}`);
}

try {
    const upstream = start(process.execPath, [helper, 'serve', 'dockersmoke', join(directory, 'appsettings.json'), 'http://127.0.0.1:8080']);
    await ready('http://127.0.0.1:8080/ready', upstream);
    const emulator = start('/opt/emulator/awps-emulator', []);
    await ready('http://127.0.0.1:8081/api/health', emulator, 'HEAD');
    const test = start(process.execPath, [helper, 'test', 'http://127.0.0.1:8081', 'http://127.0.0.1:8080', 'dockersmoke', 'container']);
    assert.equal(await test.completed, 0, test.output());
    console.log(test.output());
    console.log('PASS OneBranch container smoke');
} catch (error) {
    for (const entry of children) console.error(entry.output());
    throw error;
} finally {
    clearTimeout(timer);
    for (const { child } of children) if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.allSettled(children.map(entry => entry.completed));
    await rm(directory, { recursive: true, force: true });
}
