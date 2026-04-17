import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatClient } from '@azure/web-pubsub-chat-client';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { daemonAclRoomId } from '../shared/daemon-acl.js';
import { collectVisibleSessions } from '../web-portal/public/js/session-discovery-state.js';
import { classifyIncomingSessionRoomMessage, getRealtimeSessionAccessPatch, resolveNotificationRoomId } from '../web-portal/public/js/portal-regressions.js';
import { collectKnownRoomInfos, ensureLocalRoomInfo } from '../web-portal/public/js/room-routing-state.js';

const DEFAULT_EMULATOR_CONNECTION_STRING = 'Endpoint=http://localhost;Port=8080;AccessKey='
  + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  + '0123456789ABCDEFGH;Version=1.0;';

const CONNECTION_STRING = process.env.WebPubSubConnectionString
  || process.env.WEB_PUBSUB_CONNECTION_STRING
  || DEFAULT_EMULATOR_CONNECTION_STRING;
const HUB = 'chat';
const TEST_TIMEOUT = 180_000;
const ADMIN_USER_ID = '__portal_control__';
const PORTAL_USER_HEADER = 'x-codeagenthub-user';
const HEARTBEAT_INTERVAL_MS = 40_000;
const PORTAL_REQUEST_TIMEOUT_MS = 30_000;
const DEBUG_E2E_PROGRESS = process.env.CODEAGENTHUB_E2E_PROGRESS === '1';
const DEBUG_E2E_HANDLES = process.env.CODEAGENTHUB_E2E_DEBUG_HANDLES === '1';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = resolve(projectRoot, 'web-portal', 'web-server.js');
const serverPort = 3200 + Math.floor(Math.random() * 200);
const testRunId = randomUUID().replace(/-/g, '').slice(0, 8);

const serviceClient = new WebPubSubServiceClient(CONNECTION_STRING, HUB, { allowInsecureConnection: true });

let serverProcess = null;
let serverOutput = '';
let adminChat = null;
let bobChat = null;
let charlieSyncChat = null;
let azureUserChat = null;
let daemonHeartbeatTimer = null;

const registeredDaemons = [];
const requestTrace = [];

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseConnectionStringValue(key) {
  const part = CONNECTION_STRING
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.toLowerCase().startsWith(`${key.toLowerCase()}=`));
  return part ? part.slice(key.length + 1) : '';
}

function portalUrl(path = '') {
  return `http://127.0.0.1:${serverPort}${path}`;
}

function appendTrace(entry) {
  requestTrace.push(entry);
  while (requestTrace.length > 60) requestTrace.shift();
  serverOutput = requestTrace.join('\n');
}

function noteStep(label) {
  appendTrace(`[step] ${label}`);
  if (DEBUG_E2E_PROGRESS) {
    console.log(`[E2E] ${label}`);
  }
}

function logActiveHandles(label) {
  if (!DEBUG_E2E_HANDLES) return;
  const handles = process._getActiveHandles().map((handle) => handle?.constructor?.name || typeof handle);
  console.log(`[E2E handles] ${label}: ${handles.join(', ')}`);
}

async function stopChatClient(client, timeoutMs = 1_500) {
  if (!client) return;
  await new Promise((resolveStop) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolveStop();
    };
    const timeoutHandle = setTimeout(finish, timeoutMs);
    timeoutHandle.unref?.();
    try {
      client.onDisconnected(() => finish());
    } catch {}
    try {
      client.stop();
    } catch {
      finish();
    }
  });
}

function buildDaemonMutationPayload({ hostname, platform = 'linux', agents, workspaces }) {
  return {
    hostname,
    platform,
    agents,
    workspaces,
  };
}

async function bootstrapDaemonSessionToken({ daemonId, ownerUserId }) {
  const response = await fetch(portalUrl('/api/daemon-sessions/bootstrap'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daemonId, ownerUserId }),
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `daemon bootstrap should succeed: ${JSON.stringify(body)}`);
  assert.equal(typeof body.token, 'string');
  return body.token;
}

async function waitFor(condition, timeoutMs = 30_000, label = 'condition') {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  const suffix = lastError ? `\nLast error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}.${suffix}\nServer output:\n${serverOutput}`);
}

async function startPortalServer() {
  serverOutput = '';
  requestTrace.length = 0;
  serverProcess = spawn(process.execPath, [serverEntry, '--disable-oauth'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(serverPort),
      WEB_PUBSUB_CONNECTION_STRING: CONNECTION_STRING,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const appendProcessChunk = (chunk) => {
    for (const line of String(chunk || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      appendTrace(`[server] ${line}`);
    }
  };
  serverProcess.stdout?.on('data', appendProcessChunk);
  serverProcess.stderr?.on('data', appendProcessChunk);
  serverProcess.once('exit', (code, signal) => {
    appendTrace(`[server-exit] code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });

  await waitFor(async () => {
    if (serverProcess?.exitCode !== null) {
      throw new Error(`Portal exited early with code ${serverProcess.exitCode}`);
    }
    const response = await fetch(portalUrl('/auth/config')).catch(() => null);
    return response?.ok ? true : false;
  }, 30_000, 'portal server readiness');
}

async function stopPortalServer() {
  if (!serverProcess) return;
  const portalProcess = serverProcess;
  serverProcess = null;
  if (portalProcess.exitCode !== null) return;
  const exitPromise = new Promise((resolveExit) => {
    portalProcess.once('exit', () => resolveExit());
  });
  portalProcess.kill('SIGTERM');
  const exitedGracefully = await Promise.race([
    exitPromise.then(() => true),
    sleep(5_000).then(() => false),
  ]);
  if (!exitedGracefully && portalProcess.exitCode === null) {
    portalProcess.kill('SIGKILL');
    await exitPromise;
  }
}

function ensureDaemonHeartbeatLoop() {
  if (daemonHeartbeatTimer || !registeredDaemons.length) return;
  daemonHeartbeatTimer = setInterval(() => {
    void (async () => {
      for (const daemonConfig of [...registeredDaemons]) {
        appendTrace(`[heartbeat] ${daemonConfig.daemonId}`);
        const token = await bootstrapDaemonSessionToken(daemonConfig);
        const response = await fetch(portalUrl('/api/daemons/heartbeat'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(buildDaemonMutationPayload(daemonConfig)),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(`heartbeat failed for ${daemonConfig.daemonId}: ${response.status} ${JSON.stringify(payload)}`);
        }
      }
    })().catch((error) => {
      serverOutput += `\n[heartbeat] ${error.message}`;
    });
  }, HEARTBEAT_INTERVAL_MS);
  daemonHeartbeatTimer.unref?.();
}

async function stopDaemonHeartbeatLoop() {
  if (daemonHeartbeatTimer) {
    clearInterval(daemonHeartbeatTimer);
    daemonHeartbeatTimer = null;
  }
  if (!registeredDaemons.length) return;
  await Promise.allSettled(registeredDaemons.map(async (daemonConfig) => {
    const token = await bootstrapDaemonSessionToken(daemonConfig);
    await fetch(portalUrl('/api/daemons/offline'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(buildDaemonMutationPayload(daemonConfig)),
    });
  }));
  registeredDaemons.length = 0;
}

async function getChatClient(userId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const token = await serviceClient.getClientAccessToken({ userId });
    try {
      return await new ChatClient(token.url).login();
    } catch (error) {
      lastError = error;
      if (!/429|too many requests/i.test(String(error?.message || '')) || attempt === 5) {
        throw error;
      }
      await sleep(250 * attempt);
    }
  }
  throw lastError || new Error(`Failed to login chat client for ${userId}`);
}

async function portalRequest(userId, path, { method = 'GET', body, expectedStatus = 200 } = {}) {
  const headers = { [PORTAL_USER_HEADER]: userId };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  appendTrace(`[portal] ${method} ${path} as ${userId}`);
  let response;
  try {
    response = await fetch(portalUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(PORTAL_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    assert.fail(`${method} ${path} as ${userId} failed: ${error.message}\nServer output:\n${serverOutput}`);
  }
  const payload = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${path} as ${userId} should return ${expectedStatus}, got ${response.status}: ${JSON.stringify(payload)}\nServer output:\n${serverOutput}`,
  );
  return payload;
}

function daemonRequestPath(daemonId) {
  return `/api/daemons/${encodeURIComponent(daemonId)}/access-requests`;
}

function toSessionMap(sessions) {
  return new Map((Array.isArray(sessions) ? sessions : []).map((session) => [session.sessionId, session]));
}

function buildManagedSessionRoomTitle(session) {
  return JSON.stringify({
    t: 'ms',
    r: String(session?.roomName || session?.name || 'Session').trim() || 'Session',
    d: String(session?.daemonId || '').trim(),
    a: String(session?.agentName || session?.agent || '').trim(),
    w: String(session?.workingDirectory || '').trim(),
    o: String(session?.ownerUserId || '').trim(),
    c: String(session?.createdAt || '').trim(),
    u: String(session?.updatedAt || '').trim(),
  });
}

function frontendSessionLabel(session) {
  const workingDirectory = String(session?.workingDirectory || '');
  return workingDirectory.split(/[/\\]/).pop() || session?.name || 'Session';
}

async function registerDaemon({ daemonId, ownerUserId, hostname, platform = 'linux', agents, workspaces }) {
  const daemonConfig = { daemonId, ownerUserId, hostname, platform, agents, workspaces };
  const token = await bootstrapDaemonSessionToken(daemonConfig);
  const payload = buildDaemonMutationPayload(daemonConfig);
  appendTrace(`[daemon] register ${daemonId} owner=${ownerUserId}`);
  const response = await fetch(portalUrl('/api/daemons/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, 200, `daemon register should succeed: ${JSON.stringify(body)}`);
  registeredDaemons.push(daemonConfig);
  ensureDaemonHeartbeatLoop();
  return body;
}

async function listControlMessages(roomId) {
  const room = await adminChat.getRoom(roomId, false);
  const history = await adminChat.listMessage(room.defaultConversationId, '0', null, 100);
  return history.messages
    .map((message) => {
      try {
        return JSON.parse(message.content?.text || '');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function waitForRoomEnvelope(client, roomId, predicate, label, timeoutMs = 15_000) {
  return await new Promise((resolveEnvelope, rejectEnvelope) => {
    let settled = false;
    const finish = (error, payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      clearInterval(historyPollHandle);
      if (error) rejectEnvelope(error);
      else resolveEnvelope(payload);
    };
    const timeoutHandle = setTimeout(() => {
      finish(new Error(`Timed out waiting for ${label}\nServer output:\n${serverOutput}`));
    }, timeoutMs);
    timeoutHandle.unref?.();
    const pollHistory = async () => {
      try {
        const envelopes = await listControlMessages(roomId);
        const payload = envelopes.find((envelope) => predicate(envelope));
        if (payload) finish(null, payload);
      } catch {}
    };
    const historyPollHandle = setInterval(() => {
      void pollHistory();
    }, 400);
    historyPollHandle.unref?.();
    void pollHistory();
    client.addListenerForNewMessage((notification) => {
      if (settled || notification.conversation?.roomId !== roomId) return;
      try {
        const payload = JSON.parse(notification.message?.content?.text || '');
        if (predicate(payload, notification)) finish(null, payload);
      } catch {}
    });
  });
}

describe('E2E: CodeAgentHub portal permissions and session workflows', { timeout: TEST_TIMEOUT }, () => {
  const ownerAlpha = `owneralpha${testRunId}`;
  const ownerBeta = `ownerbeta${testRunId}`;
  const bob = `bob${testRunId}`;
  const charlie = `charlie${testRunId}`;
  const dana = `dana${testRunId}`;
  const azureUser = 'AzureUser';
  const daemonAlpha = `daemon-alpha-${testRunId}`;
  const daemonBeta = `daemon-beta-${testRunId}`;
  const daemonUi = `daemon-ui-${testRunId}`;
  const ownerUi = `ownerui${testRunId}`;
  let alphaClaude = null;
  let alphaCodex = null;
  let betaCopilot = null;
  let uiCopilot = null;

  before(async () => {
    const token = await serviceClient.getClientAccessToken({ userId: 'health-check' });
    assert.ok(token.url, 'emulator should return a client token');
    await startPortalServer();
    adminChat = await getChatClient(ADMIN_USER_ID);
  });

  after(async () => {
    await stopChatClient(bobChat);
    bobChat = null;
    await stopChatClient(charlieSyncChat);
    charlieSyncChat = null;
    await stopChatClient(azureUserChat);
    azureUserChat = null;
    logActiveHandles('before cleanup');
    await stopChatClient(adminChat);
    adminChat = null;
    await stopDaemonHeartbeatLoop();
    await stopPortalServer();
    logActiveHandles('after cleanup');
  });

  it('covers daemon visibility, member/admin approvals, session read/write approvals, and daemon isolation', async () => {
    noteStep('register daemons');
    await registerDaemon({
      daemonId: daemonAlpha,
      ownerUserId: ownerAlpha,
      hostname: 'alpha-host',
      platform: 'linux',
      agents: ['claude', 'codex'],
      workspaces: ['/workspace/alpha'],
    });
    await registerDaemon({
      daemonId: daemonBeta,
      ownerUserId: ownerBeta,
      hostname: 'beta-host',
      platform: 'linux',
      agents: ['copilot-sdk'],
      workspaces: ['/workspace/beta'],
    });

    noteStep('list visible daemons before access');
    const bobDaemonsBeforeAccess = await portalRequest(bob, '/api/daemons');
    const visibleAlpha = bobDaemonsBeforeAccess.daemons.find((daemon) => daemon.daemonId === daemonAlpha);
    const visibleBeta = bobDaemonsBeforeAccess.daemons.find((daemon) => daemon.daemonId === daemonBeta);
    assert.ok(visibleAlpha, 'alpha daemon should be visible before access is granted');
    assert.ok(visibleBeta, 'beta daemon should be visible before access is granted');
    assert.equal(visibleAlpha.hostname, 'alpha-host');
    assert.equal(visibleAlpha.platform, 'linux');
    assert.deepEqual(visibleAlpha.agents, ['claude', 'codex']);
    assert.deepEqual(visibleAlpha.workspaces, ['/workspace/alpha']);
    assert.equal(visibleBeta.hostname, 'beta-host');
    assert.equal(visibleBeta.platform, 'linux');
    assert.deepEqual(visibleBeta.agents, ['copilot-sdk']);
    assert.deepEqual(visibleBeta.workspaces, ['/workspace/beta']);
    assert.equal(visibleAlpha.canRead, false);
    assert.deepEqual(visibleAlpha.approverUserIds, [ownerAlpha]);

    noteStep('create initial sessions');
    alphaClaude = await portalRequest(ownerAlpha, '/api/sessions', {
      method: 'POST',
      body: {
        daemonId: daemonAlpha,
        agentName: 'claude',
        workingDirectory: '/workspace/alpha/claude',
        roomName: 'Alpha Claude',
      },
    });
    alphaCodex = await portalRequest(ownerAlpha, '/api/sessions', {
      method: 'POST',
      body: {
        daemonId: daemonAlpha,
        agentName: 'codex',
        workingDirectory: '/workspace/alpha/codex',
        roomName: 'Alpha Codex',
      },
    });
    betaCopilot = await portalRequest(ownerBeta, '/api/sessions', {
      method: 'POST',
      body: {
        daemonId: daemonBeta,
        agentName: 'copilot-sdk',
        workingDirectory: '/workspace/beta/copilot',
        roomName: 'Beta Copilot',
      },
    });

    noteStep('wait for control create events');
    await waitFor(async () => {
      const alphaMessages = await listControlMessages(alphaClaude.sessionId);
      return alphaMessages.some((message) => message.type === 'control.create' && message.agentName === 'claude');
    }, 15_000, 'alpha claude control.create');
    await waitFor(async () => {
      const codexMessages = await listControlMessages(alphaCodex.sessionId);
      return codexMessages.some((message) => message.type === 'control.create' && message.agentName === 'codex');
    }, 15_000, 'alpha codex control.create');

    noteStep('member request and approval');
    const blockedAlphaSessions = await portalRequest(bob, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    assert.deepEqual(blockedAlphaSessions.sessions, []);
    assert.equal(blockedAlphaSessions.blockedReason, 'daemon-access-denied');

    const bobMemberRequest = await portalRequest(bob, daemonRequestPath(daemonAlpha), {
      method: 'POST',
      body: { requestedAccess: 'member' },
    });
    assert.equal(bobMemberRequest.status, 'pending');
    const alphaOwnerRequests = await portalRequest(ownerAlpha, '/api/daemon-access-requests');
    assert.ok(alphaOwnerRequests.requests.some((request) => request.requestId === bobMemberRequest.requestId && request.requesterUserId === bob));
    await portalRequest(ownerAlpha, `${daemonRequestPath(daemonAlpha)}/${encodeURIComponent(bobMemberRequest.requestId)}/approve`, { method: 'POST' });

    const bobDaemonsAfterMember = await portalRequest(bob, '/api/daemons');
    const bobAlphaAfterMember = bobDaemonsAfterMember.daemons.find((daemon) => daemon.daemonId === daemonAlpha);
    assert.equal(bobAlphaAfterMember.canRead, true);
    assert.equal(bobAlphaAfterMember.canWrite, false);
    assert.equal(bobAlphaAfterMember.accessRequestStatus, 'approved');
    assert.equal(bobAlphaAfterMember.requestedAccess, 'member');

    const bobAlphaSessions = await portalRequest(bob, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    assert.equal(bobAlphaSessions.sessions.length, 2, 'member should see alpha sessions');
    assert.ok(bobAlphaSessions.sessions.every((session) => session.accessLevel === 'none'));
    const bobClaudeSessions = await portalRequest(bob, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}&agentName=claude`);
    assert.deepEqual(bobClaudeSessions.sessions.map((session) => session.agentName), ['claude']);
    const bobCreateDenied = await portalRequest(bob, '/api/sessions', {
      method: 'POST',
      expectedStatus: 403,
      body: {
        daemonId: daemonAlpha,
        agentName: 'claude',
        workingDirectory: '/workspace/alpha/blocked',
        roomName: 'Member Cannot Create',
      },
    });
    assert.match(String(bobCreateDenied.error || ''), /not allowed/i);

    noteStep('admin request and admin-created session');
    noteStep('submit admin request');
    const bobAdminRequest = await portalRequest(bob, daemonRequestPath(daemonAlpha), {
      method: 'POST',
      body: { requestedAccess: 'admin' },
    });
    const alphaOwnerAdminRequests = await portalRequest(ownerAlpha, '/api/daemon-access-requests');
    assert.ok(alphaOwnerAdminRequests.requests.some((request) => request.requestId === bobAdminRequest.requestId && request.requesterUserId === bob && request.requestedAccess === 'admin'));
    noteStep('approve admin request');
    await portalRequest(ownerAlpha, `${daemonRequestPath(daemonAlpha)}/${encodeURIComponent(bobAdminRequest.requestId)}/approve`, { method: 'POST' });

    const bobDaemonsAfterAdmin = await portalRequest(bob, '/api/daemons');
    const bobAlphaAfterAdmin = bobDaemonsAfterAdmin.daemons.find((daemon) => daemon.daemonId === daemonAlpha);
    assert.equal(bobAlphaAfterAdmin.canRead, true);
    assert.equal(bobAlphaAfterAdmin.canWrite, true);
    assert.equal(bobAlphaAfterAdmin.accessRequestStatus, 'approved');
    assert.equal(bobAlphaAfterAdmin.requestedAccess, 'admin');
    const alphaOwnerRequestsAfterAdminApproval = await portalRequest(ownerAlpha, '/api/daemon-access-requests');
    assert.ok(!alphaOwnerRequestsAfterAdminApproval.requests.some((request) => request.requestId === bobAdminRequest.requestId), 'approved daemon access request should disappear from pending approvals');

    noteStep('daemon admin can access-self and send to another admin session');
    bobChat = await getChatClient(bob);
    const bobAccessSelf = await portalRequest(bob, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/access-self`, {
      method: 'POST',
    });
    assert.equal(bobAccessSelf.accessLevel, 'write');
    bobChat._rooms?.delete(alphaClaude.sessionId);
    assert.ok(!bobChat.rooms.some((room) => room.roomId === alphaClaude.sessionId), 'test should reproduce a missing local room cache entry');
    await bobChat.addUserToRoom(alphaClaude.sessionId, bob);
    assert.ok(bobChat.rooms.some((room) => room.roomId === alphaClaude.sessionId), 'self add should hydrate the admin room cache');
    const bobAdminPrompt = `admin access self ${testRunId}`;
    const bobAdminMessageId = await bobChat.sendToRoom(alphaClaude.sessionId, JSON.stringify({ type: 'user.prompt', content: bobAdminPrompt }));
    assert.ok(bobAdminMessageId, 'daemon admin should be able to send to another admin session after access-self');
    await waitFor(async () => {
      const alphaMessages = await listControlMessages(alphaClaude.sessionId);
      return alphaMessages.some((message) => message.type === 'user.prompt' && message.content === bobAdminPrompt);
    }, 15_000, 'daemon admin prompt after access-self');

    noteStep('create bob admin session');
    const bobCreatedSession = await portalRequest(bob, '/api/sessions', {
      method: 'POST',
      body: {
        daemonId: daemonAlpha,
        agentName: 'codex',
        workingDirectory: '/workspace/alpha/bob',
        roomName: 'Bob Codex',
      },
    });
    assert.equal(bobCreatedSession.agentName, 'codex');
    assert.equal(bobCreatedSession.joined, true);

    noteStep('list bob visible sessions');
    const bobAllVisibleSessions = await portalRequest(bob, '/api/sessions');
    const bobAlphaClaude = bobAllVisibleSessions.sessions.find((session) => session.sessionId === alphaClaude.sessionId);
    const bobOwnedSession = bobAllVisibleSessions.sessions.find((session) => session.sessionId === bobCreatedSession.sessionId);
    assert.ok(bobAlphaClaude);
    assert.ok(bobOwnedSession);
    assert.ok(!bobAllVisibleSessions.sessions.some((session) => session.sessionId === betaCopilot.sessionId), 'beta sessions should stay hidden without daemon access');
    assert.equal(bobAlphaClaude.canDelete, true, 'daemon admins should be able to delete daemon sessions');
    assert.equal(bobOwnedSession.canDelete, true, 'session owners should be able to delete their own sessions');

    noteStep('grant daemon members and submit session access requests');
    const charlieJoinWithoutDaemonAccess = await portalRequest(charlie, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/join-requests`, {
      method: 'POST',
      expectedStatus: 403,
    });
    assert.match(String(charlieJoinWithoutDaemonAccess.error || ''), /daemon access/i);

    noteStep('patch daemon access');
    await portalRequest(ownerAlpha, `/api/daemons/${encodeURIComponent(daemonAlpha)}/access`, {
      method: 'PATCH',
      body: {
        memberUsers: [charlie, dana],
        adminUsers: [bob],
      },
    });
    charlieSyncChat = await getChatClient(charlie);
    await charlieSyncChat.getRoom(daemonAclRoomId(daemonAlpha), false);

    noteStep('verify beta still blocked');
    const blockedBetaForCharlie = await portalRequest(charlie, `/api/sessions?daemonId=${encodeURIComponent(daemonBeta)}`);
    assert.equal(blockedBetaForCharlie.blockedReason, 'daemon-access-denied');

    noteStep('verify members can see session list without session access');
    const charlieVisibleBeforeSessionAccess = await portalRequest(charlie, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    const charlieAlphaBeforeAccess = charlieVisibleBeforeSessionAccess.sessions.find((session) => session.sessionId === alphaClaude.sessionId);
    assert.equal(charlieAlphaBeforeAccess.accessLevel, 'none');
    assert.equal(charlieAlphaBeforeAccess.joined, false);
    assert.equal(charlieAlphaBeforeAccess.canDelete, false);

    noteStep('frontend session discovery excludes daemon sync rooms');
    const charlieFrontendSessions = collectVisibleSessions({
      discoveredSessions: toSessionMap(charlieVisibleBeforeSessionAccess.sessions),
      chatRooms: charlieSyncChat.rooms,
      deletedSessions: new Map(),
      currentDaemonId: daemonAlpha,
      currentAgentName: 'claude',
    });
    assert.deepEqual(
      charlieFrontendSessions.map((session) => session.sessionId),
      [alphaClaude.sessionId],
      'joined daemon sync rooms must not leak into the frontend session list',
    );

    noteStep('submit charlie read request');
    const charlieJoinRequest = await portalRequest(charlie, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/join-requests`, {
      method: 'POST',
      body: { requestedAccess: 'read' },
    });

    noteStep('verify pending read request remains visible in frontend session discovery');
    const charlieVisibleWithPendingRead = await portalRequest(charlie, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    const charlieAlphaWithPendingRead = charlieVisibleWithPendingRead.sessions.find((session) => session.sessionId === alphaClaude.sessionId);
    assert.equal(charlieAlphaWithPendingRead.accessLevel, 'none');
    assert.equal(charlieAlphaWithPendingRead.joined, false);
    assert.equal(charlieAlphaWithPendingRead.joinStatus, 'pending');
    assert.equal(charlieAlphaWithPendingRead.requestedAccess, 'read');
    const charlieFrontendSessionsWithPendingRead = collectVisibleSessions({
      discoveredSessions: toSessionMap(charlieVisibleWithPendingRead.sessions),
      chatRooms: charlieSyncChat.rooms,
      deletedSessions: new Map(),
      currentDaemonId: daemonAlpha,
      currentAgentName: 'claude',
    });
    assert.deepEqual(
      charlieFrontendSessionsWithPendingRead.map((session) => ({
        sessionId: session.sessionId,
        joinStatus: session.joinStatus,
        requestedAccess: session.requestedAccess,
      })),
      [{ sessionId: alphaClaude.sessionId, joinStatus: 'pending', requestedAccess: 'read' }],
      'frontend session discovery should preserve pending read status without surfacing daemon sync rooms',
    );

    noteStep('submit dana write request');
    const danaJoinRequest = await portalRequest(dana, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/join-requests`, {
      method: 'POST',
      body: { requestedAccess: 'write' },
    });

    noteStep('list owner and admin join requests');
    const alphaJoinRequests = await portalRequest(ownerAlpha, '/api/join-requests');
    assert.ok(alphaJoinRequests.joinRequests.some((request) => request.requestId === charlieJoinRequest.requestId && request.sessionId === alphaClaude.sessionId));
    assert.ok(alphaJoinRequests.joinRequests.some((request) => request.requestId === danaJoinRequest.requestId && request.sessionId === alphaClaude.sessionId));
    const adminJoinRequests = await portalRequest(bob, '/api/join-requests');
    assert.ok(adminJoinRequests.joinRequests.some((request) => request.requestId === charlieJoinRequest.requestId && request.sessionId === alphaClaude.sessionId));
    assert.ok(adminJoinRequests.joinRequests.some((request) => request.requestId === danaJoinRequest.requestId && request.sessionId === alphaClaude.sessionId));

    noteStep('approve and reject join requests');
    const charlieCannotApproveJoin = await portalRequest(charlie, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/join-requests/${encodeURIComponent(charlieJoinRequest.requestId)}/approve`, {
      method: 'POST',
      expectedStatus: 403,
    });
    assert.match(String(charlieCannotApproveJoin.error || ''), /session manager/i);

    await portalRequest(bob, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/join-requests/${encodeURIComponent(charlieJoinRequest.requestId)}/approve`, {
      method: 'POST',
    });
    await portalRequest(bob, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/join-requests/${encodeURIComponent(danaJoinRequest.requestId)}/reject`, {
      method: 'POST',
    });

    noteStep('verify join outcomes');
    const charlieVisibleSessions = await portalRequest(charlie, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    const charlieAlphaClaude = charlieVisibleSessions.sessions.find((session) => session.sessionId === alphaClaude.sessionId);
    assert.equal(charlieAlphaClaude.joined, true, 'approved read request should add charlie to the session');
    assert.equal(charlieAlphaClaude.accessLevel, 'read');
    assert.equal(charlieAlphaClaude.canRead, true);
    assert.equal(charlieAlphaClaude.canWrite, false);
    const charlieFrontendSessionsAfterApproval = collectVisibleSessions({
      discoveredSessions: toSessionMap(charlieVisibleSessions.sessions),
      chatRooms: charlieSyncChat.rooms,
      deletedSessions: new Map(),
      currentDaemonId: daemonAlpha,
      currentAgentName: 'claude',
    });
    assert.deepEqual(
      charlieFrontendSessionsAfterApproval.map((session) => ({
        sessionId: session.sessionId,
        accessLevel: session.accessLevel,
        canRead: session.canRead,
        canWrite: session.canWrite,
      })),
      [{ sessionId: alphaClaude.sessionId, accessLevel: 'read', canRead: true, canWrite: false }],
      'frontend session discovery should preserve approved read access without surfacing daemon sync rooms',
    );

    const danaVisibleSessions = await portalRequest(dana, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    const danaAlphaClaude = danaVisibleSessions.sessions.find((session) => session.sessionId === alphaClaude.sessionId);
    assert.equal(danaAlphaClaude.joinStatus, 'denied');
    assert.equal(danaAlphaClaude.joined, false);
    assert.equal(danaAlphaClaude.accessLevel, 'none');
    const danaFrontendSessionsAfterRejection = collectVisibleSessions({
      discoveredSessions: toSessionMap(danaVisibleSessions.sessions),
      chatRooms: [],
      deletedSessions: new Map(),
      currentDaemonId: daemonAlpha,
      currentAgentName: 'claude',
    });
    assert.deepEqual(
      danaFrontendSessionsAfterRejection.map((session) => ({
        sessionId: session.sessionId,
        joinStatus: session.joinStatus,
        requestedAccess: session.requestedAccess,
        accessLevel: session.accessLevel,
      })),
      [{ sessionId: alphaClaude.sessionId, joinStatus: 'denied', requestedAccess: 'write', accessLevel: 'none' }],
      'frontend session discovery should preserve denied write requests for visible daemon members',
    );

    noteStep('leave and delete session flows');
    await portalRequest(charlie, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}/members/${encodeURIComponent(charlie)}`, { method: 'DELETE' });
    const charlieAfterLeave = await portalRequest(charlie, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    const charlieAlphaClaudeAfterLeave = charlieAfterLeave.sessions.find((session) => session.sessionId === alphaClaude.sessionId);
    assert.equal(charlieAlphaClaudeAfterLeave.joined, false, 'leaving should remove room membership');
    assert.equal(charlieAlphaClaudeAfterLeave.accessLevel, 'none');
    const charlieFrontendSessionsAfterLeave = collectVisibleSessions({
      discoveredSessions: toSessionMap(charlieAfterLeave.sessions),
      chatRooms: charlieSyncChat.rooms,
      deletedSessions: new Map(),
      currentDaemonId: daemonAlpha,
      currentAgentName: 'claude',
    });
    assert.deepEqual(
      charlieFrontendSessionsAfterLeave.map((session) => ({
        sessionId: session.sessionId,
        accessLevel: session.accessLevel,
        canRead: session.canRead,
        canWrite: session.canWrite,
      })),
      [{ sessionId: alphaClaude.sessionId, accessLevel: 'none', canRead: false, canWrite: false }],
      'frontend session discovery should fall back to visible no-access after leaving without surfacing daemon sync rooms',
    );

    const nonOwnerDeleteDenied = await portalRequest(charlie, `/api/sessions/${encodeURIComponent(alphaClaude.sessionId)}`, {
      method: 'DELETE',
      expectedStatus: 403,
    });
    assert.match(String(nonOwnerDeleteDenied.error || ''), /session manager/i);

    const daemonDeleteEvent = waitForRoomEnvelope(
      charlieSyncChat,
      daemonAclRoomId(daemonAlpha),
      (payload) => payload.type === 'session.deleted' && payload.sessionId === alphaCodex.sessionId,
      'daemon session delete sync',
    );
    await portalRequest(bob, `/api/sessions/${encodeURIComponent(alphaCodex.sessionId)}`, { method: 'DELETE' });
    const deletedEnvelope = await daemonDeleteEvent;
    assert.equal(deletedEnvelope.daemonId, daemonAlpha);
    assert.equal(deletedEnvelope.agentName, 'codex');
    const bobSessionsAfterAdminDelete = await portalRequest(bob, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    assert.ok(!bobSessionsAfterAdminDelete.sessions.some((session) => session.sessionId === alphaCodex.sessionId), 'daemon admin delete should remove the session from listings');

    await portalRequest(bob, `/api/sessions/${encodeURIComponent(bobCreatedSession.sessionId)}`, { method: 'DELETE' });
    const bobSessionsAfterDelete = await portalRequest(bob, `/api/sessions?daemonId=${encodeURIComponent(daemonAlpha)}`);
    assert.ok(!bobSessionsAfterDelete.sessions.some((session) => session.sessionId === bobCreatedSession.sessionId), 'deleted session should disappear from listings');

    noteStep('register AzureUser managed-session name regression scenario');
    await registerDaemon({
      daemonId: daemonUi,
      ownerUserId: ownerUi,
      hostname: 'browser-ui-host',
      platform: 'linux',
      agents: ['copilot'],
      workspaces: ['/workspace/demo'],
    });
    uiCopilot = await portalRequest(ownerUi, '/api/sessions', {
      method: 'POST',
      body: {
        daemonId: daemonUi,
        agentName: 'copilot',
        workingDirectory: '/workspace/demo',
        roomName: 'Browser UI Session',
      },
    });
    await portalRequest(ownerUi, `/api/daemons/${encodeURIComponent(daemonUi)}/access`, {
      method: 'PATCH',
      body: {
        memberUsers: [azureUser],
        adminUsers: [],
      },
    });

    noteStep('approve AzureUser managed-session read access');
    const azureJoinRequest = await portalRequest(azureUser, `/api/sessions/${encodeURIComponent(uiCopilot.sessionId)}/join-requests`, {
      method: 'POST',
      body: { requestedAccess: 'read' },
    });
    await portalRequest(ownerUi, `/api/sessions/${encodeURIComponent(uiCopilot.sessionId)}/join-requests/${encodeURIComponent(azureJoinRequest.requestId)}/approve`, {
      method: 'POST',
    });

    const azureVisibleUiSessions = await portalRequest(azureUser, `/api/sessions?daemonId=${encodeURIComponent(daemonUi)}&agentName=copilot`);
    const azureVisibleUiSession = azureVisibleUiSessions.sessions.find((session) => session.sessionId === uiCopilot.sessionId);
    assert.ok(azureVisibleUiSession, 'AzureUser should see the managed copilot session');
    assert.equal(azureVisibleUiSession.roomName, 'Browser UI Session');
    assert.equal(azureVisibleUiSession.accessLevel, 'read');
    assert.equal(azureVisibleUiSession.joined, true);

    azureUserChat = await getChatClient(azureUser);
    const azureRoomInfo = await azureUserChat.getRoom(uiCopilot.sessionId, false);
    const managedSessionRoomTitle = [azureRoomInfo?.title, azureRoomInfo?.name, azureRoomInfo?.roomName, azureRoomInfo?.displayName]
      .find((value) => typeof value === 'string' && value.includes('"t"')) || buildManagedSessionRoomTitle(uiCopilot);
    assert.match(managedSessionRoomTitle, /"t"\s*:\s*"ms"/, 'test setup should use managed-session JSON metadata as the local room title');

    noteStep('frontend fallback should keep AzureUser session names readable');
    const azureLocalOnlySessions = collectVisibleSessions({
      discoveredSessions: new Map(),
      chatRooms: [{ roomId: uiCopilot.sessionId, title: managedSessionRoomTitle, updatedAt: uiCopilot.updatedAt }],
      deletedSessions: new Map(),
      currentDaemonId: daemonUi,
      currentAgentName: 'copilot',
    });
    assert.deepEqual(
      azureLocalOnlySessions.map((session) => ({
        sessionId: session.sessionId,
        name: session.name,
        label: frontendSessionLabel(session),
        workingDirectory: session.workingDirectory,
      })),
      [{
        sessionId: uiCopilot.sessionId,
        name: 'Browser UI Session',
        label: 'demo',
        workingDirectory: '/workspace/demo',
      }],
      'AzureUser local session fallback should parse managed-session metadata instead of surfacing raw JSON',
    );

    const azureMergedSessions = collectVisibleSessions({
      discoveredSessions: toSessionMap(azureVisibleUiSessions.sessions),
      chatRooms: [{ roomId: uiCopilot.sessionId, title: managedSessionRoomTitle, updatedAt: uiCopilot.updatedAt }],
      deletedSessions: new Map(),
      currentDaemonId: daemonUi,
      currentAgentName: 'copilot',
    });
    assert.deepEqual(
      azureMergedSessions.map((session) => ({
        sessionId: session.sessionId,
        name: session.name,
        label: frontendSessionLabel(session),
      })),
      [{
        sessionId: uiCopilot.sessionId,
        name: 'Browser UI Session',
        label: 'demo',
      }],
      'AzureUser merged portal and local session state should keep the readable session label',
    );
    assert.ok(azureMergedSessions.every((session) => !String(session.name || '').includes('{')), 'session names should never leak raw managed-session JSON');

    noteStep('scenario complete');
  });

  it('hydrates observer daemon and session room metadata after approval so Copilot realtime sync no longer needs a refresh', async () => {
    const scenarioId = randomUUID().replace(/-/g, '').slice(0, 6);
    const owner = `ownercopilot${scenarioId}`;
    const observer = `azureobserver${scenarioId}`;
    const daemonId = `daemon-copilot-${scenarioId}`;
    let observerChat = null;
    let ownerSession = null;
    const supplementalRoomInfos = new Map();

    try {
      noteStep('register local Copilot observer regression daemon');
      observerChat = await getChatClient(observer);
      await registerDaemon({
        daemonId,
        ownerUserId: owner,
        hostname: 'copilot-regression-host',
        platform: 'linux',
        agents: ['copilot-sdk'],
        workspaces: ['/workspace/copilot-regression'],
      });

      noteStep('grant daemon admin access after observer login');
      const daemonAccessRequest = await portalRequest(observer, daemonRequestPath(daemonId), {
        method: 'POST',
        body: { requestedAccess: 'admin' },
      });
      await portalRequest(owner, `${daemonRequestPath(daemonId)}/${encodeURIComponent(daemonAccessRequest.requestId)}/approve`, {
        method: 'POST',
      });
      assert.equal(observerChat.rooms.some((room) => room.roomId === daemonAclRoomId(daemonId)), false);
      const daemonSyncRoomInfo = await ensureLocalRoomInfo(daemonAclRoomId(daemonId), {
        chatRooms: observerChat.rooms,
        supplementalRoomInfos,
        hasJoinedRoom: (roomId) => observerChat.hasJoinedRoom(roomId),
        getRoomInfo: (roomId) => observerChat.getRoom(roomId, false),
        addSelfToRoom: (roomId, userId) => observerChat.addUserToRoom(roomId, userId),
        currentUserId: observerChat.userId,
      });
      assert.equal(daemonSyncRoomInfo?.roomId, daemonAclRoomId(daemonId), 'frontend hydration should cache the daemon sync room immediately after approval');

      noteStep('owner creates Copilot session after approval');
      ownerSession = await portalRequest(owner, '/api/sessions', {
        method: 'POST',
        body: {
          daemonId,
          agentName: 'copilot-sdk',
          workingDirectory: '/workspace/copilot-regression/demo',
          roomName: 'Copilot Observer Regression',
        },
      });

      await waitFor(async () => {
        const messages = await listControlMessages(ownerSession.sessionId);
        return messages.some((message) => message.type === 'control.create' && message.agentName === 'copilot-sdk');
      }, 15_000, 'copilot observer regression control.create');

      noteStep('daemon sync routing should resolve session.created without a refresh');
      const sessionCreatedNotification = {
        conversation: { conversationId: daemonSyncRoomInfo.defaultConversationId },
        message: {
          content: {
            text: JSON.stringify({
              type: 'session.created',
              sessionId: ownerSession.sessionId,
              daemonId,
              agentName: 'copilot-sdk',
              roomName: ownerSession.roomName,
              workingDirectory: ownerSession.workingDirectory,
              ownerUserId: ownerSession.ownerUserId,
              updatedAt: ownerSession.updatedAt,
            }),
          },
        },
      };
      assert.equal(
        resolveNotificationRoomId(sessionCreatedNotification, collectKnownRoomInfos({ chatRooms: observerChat.rooms, supplementalRoomInfos })),
        daemonAclRoomId(daemonId),
        'frontend room hydration should resolve conversationId-only daemon sync notifications without waiting for a manual refresh',
      );
      const discoveredSessions = new Map([[ownerSession.sessionId, {
        ...ownerSession,
        ...getRealtimeSessionAccessPatch(ownerSession, { currentUserId: observer, daemon: { canWrite: true } }),
      }]]);
      const observerLocalSessionsBeforeRefresh = collectVisibleSessions({
        discoveredSessions,
        chatRooms: observerChat.rooms,
        deletedSessions: new Map(),
        currentDaemonId: daemonId,
        currentAgentName: 'copilot-sdk',
      });
      assert.deepEqual(
        observerLocalSessionsBeforeRefresh.map((session) => session.sessionId),
        [ownerSession.sessionId],
        'observer should see the Copilot session from realtime state without a refresh-style portal query',
      );

      noteStep('session access-self should hydrate local room metadata for live routing');
      const observerAccessSelf = await portalRequest(observer, `/api/sessions/${encodeURIComponent(ownerSession.sessionId)}/access-self`, {
        method: 'POST',
      });
      assert.equal(observerAccessSelf.accessLevel, 'write');
      const sessionRoomInfo = await ensureLocalRoomInfo(ownerSession.sessionId, {
        chatRooms: observerChat.rooms,
        supplementalRoomInfos,
        hasJoinedRoom: (roomId) => observerChat.hasJoinedRoom(roomId),
        getRoomInfo: (roomId) => observerChat.getRoom(roomId, false),
        addSelfToRoom: (roomId, userId) => observerChat.addUserToRoom(roomId, userId),
        currentUserId: observerChat.userId,
      });
      assert.equal(sessionRoomInfo?.roomId, ownerSession.sessionId, 'frontend session hydration should cache the session room metadata before opening the room');
      const livePromptNotification = {
        conversation: { conversationId: sessionRoomInfo.defaultConversationId },
        message: {
          messageId: `observer-regression-${scenarioId}`,
          createdBy: owner,
          createdAt: new Date().toISOString(),
          content: { text: JSON.stringify({ type: 'user.prompt', content: 'say hi' }) },
        },
      };
      assert.deepEqual(
        classifyIncomingSessionRoomMessage(livePromptNotification, {
          currentRoomId: ownerSession.sessionId,
          currentUserId: observer,
          roomInfos: collectKnownRoomInfos({
            chatRooms: observerChat.rooms,
            supplementalRoomInfos,
            currentSession: { sessionId: ownerSession.sessionId, defaultConversationId: sessionRoomInfo.defaultConversationId },
          }),
          seenRoomMessageIds: new Set(),
          historyLoadedAt: 0,
        }),
        { action: 'render', reason: 'match', roomId: ownerSession.sessionId },
        'once the frontend hydrates the session room metadata, the observer should render live Copilot room updates without switching agents or refreshing',
      );
    } finally {
      await stopChatClient(observerChat);
    }
  });
});