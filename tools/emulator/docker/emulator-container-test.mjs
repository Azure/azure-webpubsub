// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { rename, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const protocol = 'json.webpubsub.azure.v1';
const timeoutMs = 10000;
const apiVersion = 'api-version=2024-01-01';
const key = process.env.EMULATOR_TEST_ACCESS_KEY;
assert.ok(key?.length >= 32, 'EMULATOR_TEST_ACCESS_KEY must contain at least 32 characters');
assert.ok(typeof WebSocket === 'function', 'Node.js 22+ with built-in WebSocket is required');

function token(audience, claims = {}, signingKey = key) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ aud: audience, nbf: now - 60, exp: now + 600, ...claims })}`;
    // Access keys are UTF-8 strings, not base64-decoded bytes (WebPubSubTokenService).
    return `${unsigned}.${createHmac('sha256', signingKey).update(unsigned).digest('base64url')}`;
}

async function request(url, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    const text = await response.text();
    return { status: response.status, text };
}

async function rest(endpoint, path, method, expected, body, authorization = token(endpoint + path)) {
    const headers = { 'Content-Type': 'text/plain' };
    if (authorization !== null) headers.Authorization = `Bearer ${authorization}`;
    const response = await request(`${endpoint}${path}?${apiVersion}`, { method, headers, body });
    assert.equal(response.status, expected, `${method} ${path}: ${response.text.slice(0, 1000)}`);
}

async function rejectedUpgrade(url) {
    // The WebSocket API hides handshake status codes; use an actual HTTP upgrade
    // request for rejection checks rather than interpreting any socket error as 401.
    await new Promise((resolve, reject) => {
        const req = http.request(url, {
            headers: {
                Connection: 'Upgrade', Upgrade: 'websocket',
                'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
                'Sec-WebSocket-Protocol': protocol,
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        req.on('response', response => {
            response.resume();
            if (response.statusCode === 401) resolve();
            else reject(new Error(`Unauthenticated WebSocket upgrade returned HTTP ${response.statusCode}, expected 401`));
        });
        req.on('upgrade', (_response, socket) => {
            socket.destroy();
            reject(new Error('Unauthenticated WebSocket upgrade was accepted'));
        });
        req.on('error', () => reject(new Error('WebSocket rejection check failed before receiving an HTTP status')));
        req.end();
    });
}

class Client {
    constructor(url) {
        this.messages = [];
        this.failure = null;
        this.waiter = null;
        this.socket = new WebSocket(url, protocol);
        this.socket.addEventListener('message', event => {
            try {
                assert.equal(typeof event.data, 'string', 'Expected a JSON text frame');
                this.messages.push(JSON.parse(event.data));
                assert.ok(this.messages.length <= 64, 'Unexpected WebSocket message flood');
            } catch (error) { this.failure = error; }
            this.wake();
        });
        this.socket.addEventListener('error', () => {
            this.failure = new Error('Authenticated WebSocket transport failed');
            this.wake();
        });
        this.socket.addEventListener('close', event => {
            this.failure ??= new Error(`WebSocket closed (${event.code}) before the expected message`);
            this.wake();
        });
    }

    wake() {
        if (this.waiter) {
            const waiter = this.waiter;
            this.waiter = null;
            clearTimeout(waiter.timer);
            waiter.resolve();
        }
    }

    async next(description) {
        if (!this.messages.length && !this.failure) {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.waiter = null;
                    reject(new Error(`Timed out waiting for ${description}`));
                }, timeoutMs);
                this.waiter = { resolve, timer };
            });
        }
        if (this.messages.length) return this.messages.shift();
        throw this.failure ?? new Error(`Missing ${description}`);
    }

    async connected(userId) {
        const message = await this.next('connected system event');
        assert.equal(this.socket.protocol, protocol);
        assert.equal(message.type, 'system');
        assert.equal(message.event, 'connected');
        assert.equal(message.userId, userId);
        assert.ok(message.connectionId, 'Missing connectionId');
        this.connectionId = message.connectionId;
    }

    async text(expected, from = 'server', group) {
        const message = await this.next(`${from} message ${expected}`);
        assert.equal(message.type, 'message');
        assert.equal(message.from, from);
        if (group !== undefined) assert.equal(message.group, group);
        assert.equal(message.dataType, 'text');
        assert.equal(message.data, expected);
    }

    async close() {
        if (this.socket.readyState === WebSocket.CLOSED) return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('WebSocket close handshake timed out')), timeoutMs);
            this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.close(1000, 'Docker validation complete');
        });
    }

    async echo(payload, ackId) {
        this.socket.send(JSON.stringify({ type: 'event', event: 'echo', ackId, dataType: 'json', data: payload }));
        const reply = await this.next('HTTP upstream reply');
        assert.equal(reply.type, 'message');
        assert.equal(reply.from, 'server');
        assert.equal(reply.dataType, 'json');
        assert.equal(reply.metadata?.smoke, 'http-upstream');
        assert.deepEqual(reply.data.echo, payload);
        assert.equal(reply.data.connectionId, this.connectionId);
        const ack = await this.next('user event acknowledgment');
        assert.equal(ack.type, 'ack');
        assert.equal(ack.ackId, ackId);
        assert.equal(ack.success, true);
        return reply.data.origin;
    }
}

async function observations(endpoint, connectionId) {
    const response = await request(`${endpoint}/observations?connectionId=${encodeURIComponent(connectionId)}`);
    assert.equal(response.status, 200, 'Could not read HTTP upstream observations');
    return JSON.parse(response.text);
}

async function runTest(endpoint, upstreamEndpoint, hub, route) {
    assert.ok(endpoint && upstreamEndpoint && hub && route, 'test requires endpoint, upstream endpoint, hub, and route');
    assert.equal(new URL(endpoint).protocol, 'http:', 'These isolated local tests require HTTP');
    const runId = `${route}-${randomUUID()}`;
    const hubPath = `/api/hubs/${hub}`;
    const sendPath = `${hubPath}/:send`;
    const clientPath = `/client/hubs/${hub}`;
    const audience = endpoint + clientPath;
    const badKey = randomBytes(48).toString('base64');
    const configuration = await request(`${upstreamEndpoint}/configuration`);
    assert.equal(configuration.status, 200);
    const { origin } = JSON.parse(configuration.text);
    await rest(endpoint, sendPath, 'POST', 401, 'must-not-send', null);
    await rest(endpoint, sendPath, 'POST', 401, 'must-not-send', token(endpoint + sendPath, {}, badKey));
    await rest(endpoint, sendPath, 'POST', 401, 'must-not-send', token(`${endpoint}/api/hubs/wrong/:send`));
    await rest(endpoint, sendPath, 'POST', 401, 'must-not-send', token(endpoint + sendPath, { nbf: 1, exp: 2 }));
    await rejectedUpgrade(audience);
    await rejectedUpgrade(`${audience}?access_token=${token(audience, {}, badKey)}`);
    console.log(`PASS [${route}] missing, invalid, expired, and wrong-audience REST auth; missing/invalid WebSocket auth`);

    const clients = [];
    let completed = false;
    try {
        for (const suffix of ['member', 'outsider']) {
            const userId = `${runId}-${suffix}`;
            const url = new URL(audience);
            url.protocol = 'ws:';
            url.searchParams.set('access_token', token(audience, { sub: userId }));
            const client = new Client(url);
            clients.push(client);
            await client.connected(userId);
        }
        const [member, outsider] = clients;
        assert.notEqual(member.connectionId, outsider.connectionId);
        await rest(endpoint, `${hubPath}/connections/${member.connectionId}`, 'HEAD', 200);
        const broadcast = `broadcast-${runId}`;
        await rest(endpoint, sendPath, 'POST', 202, broadcast);
        await Promise.all(clients.map(client => client.text(broadcast)));
        console.log(`PASS [${route}] authenticated REST broadcast delivered to two real WebSockets`);

        const groupPath = `${hubPath}/groups/${runId}`;
        const membershipPath = `${groupPath}/connections/${member.connectionId}`;
        await rest(endpoint, membershipPath, 'PUT', 200);
        await rest(endpoint, groupPath, 'HEAD', 200);
        const grouped = `group-${runId}`;
        await rest(endpoint, `${groupPath}/:send`, 'POST', 202, grouped);
        // A later broadcast is an ordered barrier: the nonmember must receive it
        // first, proving exclusion without an arbitrary "nothing arrived" sleep.
        const barrier = `after-group-${runId}`;
        await rest(endpoint, sendPath, 'POST', 202, barrier);
        await member.text(grouped, 'group', runId);
        await Promise.all(clients.map(client => client.text(barrier)));
        await rest(endpoint, membershipPath, 'DELETE', 204);
        await rest(endpoint, `${groupPath}/:send`, 'POST', 202, `removed-${runId}`);
        const removedBarrier = `after-remove-${runId}`;
        await rest(endpoint, sendPath, 'POST', 202, removedBarrier);
        await Promise.all(clients.map(client => client.text(removedBarrier)));
        console.log(`PASS [${route}] REST group add/send/remove, member delivery, and nonmember exclusion`);

        const payload = { runId, text: 'real HTTP upstream roundtrip' };
        assert.equal(await member.echo(payload, 71), origin);

        let recorded;
        const deadline = Date.now() + timeoutMs;
        do {
            recorded = await observations(upstreamEndpoint, member.connectionId);
            if (recorded.events.some(event => event.type === 'azure.webpubsub.sys.connected')) break;
            await delay(100);
        } while (Date.now() < deadline);
        assert.ok(recorded.validations.length > 0, 'No real webhook OPTIONS validation was observed');
        for (const type of ['azure.webpubsub.sys.connect', 'azure.webpubsub.sys.connected', 'azure.webpubsub.user.echo']) {
            const event = recorded.events.find(item => item.type === type);
            assert.ok(event, `Upstream never received ${type}`);
            assert.equal(event.hub, hub);
            assert.equal(event.connectionId, member.connectionId);
            assert.equal(event.userId, `${runId}-member`);
            assert.equal(event.signatureValid, true);
            if (type === 'azure.webpubsub.user.echo') {
                assert.equal(event.path, `/events/${hub}/echo`);
                assert.equal(event.state, 'from-upstream');
                assert.deepEqual(event.body, payload);
            }
        }
        console.log(`PASS [${route}] actual HTTP OPTIONS, signed connect/connected callbacks, and user event response before ack`);

        const updated = await request(`${upstreamEndpoint}/configuration?origin=${runId}`, { method: 'POST' });
        assert.equal(updated.status, 204, 'Could not replace mounted appsettings.json');
        const reloadDeadline = Date.now() + timeoutMs;
        let observedOrigin;
        let ackId = 72;
        do {
            observedOrigin = await member.echo(payload, ackId++);
            if (observedOrigin === runId) break;
            assert.equal(observedOrigin, origin, 'Unexpected handler during reload');
            await delay(100);
        } while (Date.now() < reloadDeadline);
        assert.equal(observedOrigin, runId, 'Mounted configuration did not reload on the existing WebSocket');
        const afterReload = `after-reload-${runId}`;
        await rest(endpoint, sendPath, 'POST', 202, afterReload);
        await Promise.all(clients.map(client => client.text(afterReload)));
        console.log(`PASS [${route}] atomic mounted configuration reload updates the handler without reconnecting either client`);
        completed = true;
    } finally {
        const results = await Promise.allSettled(clients.map(client => client.close()));
        const failure = results.find(result => result.status === 'rejected');
        if (failure && completed) throw failure.reason;
    }
}

async function serve(hub) {
    assert.ok(hub, 'serve requires a hub');
    let origin = 'http-upstream';
    async function writeConfiguration(nextOrigin) {
        const configuration = {
            WebPubSub: {
                // Authentication must use the environment override, including after reload.
                AccessKey: 'file-key-overridden-by-the-environment',
                Hubs: {
                    [hub]: {
                        EventHandlers: [{
                            UrlTemplate: `http://upstream:8080/events/{hub}/{event}?origin=${encodeURIComponent(nextOrigin)}`,
                            SystemEvents: ['connect', 'connected'],
                            EventPattern: 'echo',
                        }],
                    },
                },
            },
        };
        const path = '/home/node/appsettings.json';
        await writeFile(`${path}.tmp`, JSON.stringify(configuration));
        await rename(`${path}.tmp`, path);
        origin = nextOrigin;
    }
    await writeConfiguration(origin);
    const events = [];
    const validations = [];
    const retain = (list, item) => { list.push(item); if (list.length > 64) list.shift(); };
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://upstream');
            if (url.pathname === '/configuration' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ origin }));
                return;
            }
            if (url.pathname === '/configuration' && req.method === 'POST') {
                const nextOrigin = url.searchParams.get('origin');
                assert.match(nextOrigin, /^(host|network)-[a-f0-9-]{36}$/);
                await writeConfiguration(nextOrigin);
                res.writeHead(204).end();
                return;
            }
            if (req.method === 'GET' && url.pathname === '/ready') {
                res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ready');
                return;
            }
            if (req.method === 'GET' && url.pathname === '/observations') {
                const connectionId = url.searchParams.get('connectionId');
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
                    validations, events: events.filter(event => event.connectionId === connectionId),
                }));
                return;
            }
            if (req.method === 'OPTIONS' && url.pathname === `/events/${hub}/validate`) {
                const origin = req.headers['webhook-request-origin'];
                assert.ok(origin, 'Missing WebHook-Request-Origin');
                assert.equal(req.headers['ce-awpsversion'], '1.0');
                retain(validations, { path: url.pathname, origin });
                res.writeHead(200, { 'WebHook-Allowed-Origin': origin }).end();
                console.log(`OPTIONS webhook validation for ${origin}`);
                return;
            }
            if (req.method !== 'POST' || !url.pathname.startsWith(`/events/${hub}/`)) {
                res.writeHead(404).end();
                return;
            }
            const chunks = [];
            let length = 0;
            for await (const chunk of req) {
                length += chunk.length;
                assert.ok(length <= 65536, 'Upstream request exceeded 64 KiB');
                chunks.push(chunk);
            }
            const connectionId = req.headers['ce-connectionid'];
            const name = url.pathname.split('/').at(-1);
            assert.ok(connectionId, 'Missing ce-connectionId');
            assert.equal(req.headers['ce-hub'], hub);
            assert.equal(req.headers['ce-eventname'], name);
            assert.equal(req.headers['ce-specversion'], '1.0');
            assert.equal(req.headers['ce-source'], `/hubs/${hub}/client/${connectionId}`);
            assert.ok(req.headers['ce-id'], 'Missing ce-id');
            const signature = `sha256=${createHmac('sha256', key).update(connectionId).digest('hex')}`;
            assert.equal(req.headers['ce-signature'], signature, 'Invalid upstream ce-signature');
            const type = `azure.webpubsub.${name === 'echo' ? 'user' : 'sys'}.${name}`;
            assert.equal(req.headers['ce-type'], type);
            assert.ok(['connect', 'connected', 'echo'].includes(name), 'Unexpected upstream event');
            const body = name === 'echo' ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
            retain(events, {
                path: url.pathname, type, hub, connectionId, signatureValid: true,
                userId: req.headers['ce-userid'], state: req.headers['ce-connectionstate'], body,
            });
            console.log(`POST ${url.pathname} connection=${connectionId} signature=valid`);
            if (name === 'echo') {
                assert.match(req.headers['content-type'], /^application\/json(?:;|$)/);
                res.writeHead(200, { 'Content-Type': 'application/json', 'x-webpubsub-metadata-smoke': 'http-upstream' })
                    .end(JSON.stringify({ echo: body, connectionId, origin: url.searchParams.get('origin') }));
            } else {
                res.writeHead(204, { 'ce-connectionState': 'from-upstream' }).end();
            }
        } catch (error) {
            console.error(`Upstream failure: ${error.message}`);
            if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Upstream contract check failed');
        }
    });
    server.requestTimeout = timeoutMs;
    server.headersTimeout = timeoutMs;
    server.setTimeout(timeoutMs, socket => socket.destroy());
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(8080, '0.0.0.0', resolve);
    });
    console.log('HTTP upstream listening on 0.0.0.0:8080');
    process.on('SIGTERM', () => { server.close(); server.closeAllConnections(); });
}

try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'serve') await serve(...args);
    else if (mode === 'test') await runTest(...args);
    else throw new Error('Expected serve or test mode');
} catch (error) {
    console.error(`FAIL: ${error.stack ?? error.message}`);
    process.exit(1);
}
