import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import jsonwebtoken from 'jsonwebtoken';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { ChatClient } from '@azure/web-pubsub-chat-client';
import {
  buildDaemonAclRoomTitle,
  buildDesiredDaemonAclMembers,
  canAdminDaemonAccess,
  canMemberDaemonAccess,
  canReadDaemonAccess,
  canManageDaemonAccess,
  canWriteDaemonAccess,
  daemonAclRoomId,
  deriveDaemonAclState,
  parseDaemonAclRoomTitle,
} from './daemon-acl.js';
import { listDaemonRegistryRecordsWithFallback } from './daemon-registry.js';
import { listRoomMessagesWithFallback } from './room-history.js';
import {
  buildSessionListForUser,
  createSessionIndexState,
  findJoinRequestById,
  getLatestJoinRequestForUser,
  getSessionAccessLevelFromIndex,
  hydrateSessionIndices,
  listJoinRequestsForSession,
  markTrustedSessionDeleted,
  removeTrustedSessionMembership,
  upsertTrustedJoinRequestState,
  upsertTrustedSessionDirectoryRecord,
  upsertTrustedSessionMembership,
} from './session-index.js';
import {
  DELEGATION_CONTROL_ROOM_ID,
  buildDelegationControlEnvelope,
  buildDelegationRelayRoomId,
  buildDelegationSummaryEnvelope,
  buildDelegationTargetControlEnvelope,
  controlTypeForTerminalStatus,
  isDelegationTerminalStatus,
  parseDelegationControlEnvelope,
  summaryTypeForTerminalStatus,
} from './session-delegation.js';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'path';
import { config as loadEnv } from 'dotenv';

const __dirname = process.argv[1]
  ? dirname(resolve(process.argv[1]))
  : process.cwd();

function resolveExistingPath(label, candidates) {
  const resolved = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!resolved) {
    throw new Error(`Missing ${label}. Looked in: ${candidates.join(', ')}`);
  }
  return resolved;
}

const envPath = [join(__dirname, '.env'), join(__dirname, '..', '.env')]
  .find((candidate) => existsSync(candidate));
if (envPath) {
  loadEnv({ path: envPath });
}

const publicRoot = resolveExistingPath('public assets', [
  join(__dirname, 'public'),
  join(__dirname, '..', 'public'),
]);

function sendJavaScriptAsset(res, label, candidates) {
  let assetPath;
  try {
    assetPath = resolveExistingPath(label, candidates);
  } catch (error) {
    console.error(`[Web] Failed to resolve ${label}:`, error.message);
    if (!res.headersSent) res.status(500).type('text/plain').end();
    return;
  }

  res.type('application/javascript').sendFile(assetPath, (error) => {
    if (!error) return;
    console.error(`[Web] Failed to serve ${label}:`, error.message);
    if (!res.headersSent) res.status(error.statusCode || 500).end();
  });
}

const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING || process.env.WebPubSubConnectionString;
if (!connectionString) {
  console.error('Error: WEB_PUBSUB_CONNECTION_STRING or WebPubSubConnectionString environment variable is required');
  process.exit(1);
}

const DISABLE_OAUTH = process.argv.includes('--disable-oauth');
const GITHUB_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';
const OAUTH_CONFIGURED = !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
const OAUTH_ENABLED = OAUTH_CONFIGURED && !DISABLE_OAUTH;

function oauthUnavailableMessage() {
  if (DISABLE_OAUTH) return 'OAuth disabled by startup flag';
  return 'OAuth not configured';
}

const hubName = process.env.WEB_PUBSUB_HUB || 'chat';
const port = parseInt(process.env.PORT || '3000', 10);
const LOBBY_ROOM = 'lobby';
const ADMIN_USER_ID = process.env.PORTAL_CONTROL_USER_ID || '__portal_control__';
const VALID_USER_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DAEMON_SESSION_SECRET = process.env.DAEMON_SESSION_SECRET || SESSION_SECRET;
const PORTAL_NEGOTIATE_PATH = '/negotiate:portal';
const PORTAL_USER_HEADER = 'x-codeagenthub-user';
const DAEMON_HEARTBEAT_STALE_MS = 90_000;
const DAEMON_SESSION_AUDIENCE = 'codeagenthub-daemon';
const DAEMON_SESSION_ISSUER = 'codeagenthub-portal';
const CHAT_REST_API_VERSION = '2026-02-01-preview';
const WORKSPACE_REQUEST_TIMEOUT_MS = 5_000;
const DAEMON_ACCESS_STATE_CACHE_TTL_MS = 2_500;

function parseConnectionStringValue(key) {
  const part = connectionString
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.toLowerCase().startsWith(`${key.toLowerCase()}=`));
  return part ? part.slice(key.length + 1) : '';
}

const portalAccessKey = parseConnectionStringValue('AccessKey') || '';
const portalSigningKey = Buffer.from(portalAccessKey, 'base64');
if (!portalAccessKey || !portalSigningKey.length) {
  console.error('Error: failed to parse AccessKey from WEB_PUBSUB_CONNECTION_STRING');
  process.exit(1);
}

function issueDaemonSessionToken(daemonId, ownerUserId) {
  return jsonwebtoken.sign(
    {
      sub: String(daemonId || '').trim(),
      ownerUserId: String(ownerUserId || '').trim(),
      type: 'daemon-session',
    },
    DAEMON_SESSION_SECRET,
    {
      algorithm: 'HS256',
      audience: DAEMON_SESSION_AUDIENCE,
      issuer: DAEMON_SESSION_ISSUER,
    },
  );
}

function parseDaemonSessionToken(req) {
  const authorization = String(req.get('authorization') || '').trim();
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return { ok: false, error: 'Missing daemon bearer token' };
  }
  const token = authorization.slice('bearer '.length).trim();
  if (!token) {
    return { ok: false, error: 'Missing daemon bearer token' };
  }

  try {
    const payload = jsonwebtoken.verify(token, DAEMON_SESSION_SECRET, {
      algorithms: ['HS256'],
      audience: DAEMON_SESSION_AUDIENCE,
      issuer: DAEMON_SESSION_ISSUER,
    });
    const daemonId = String(payload?.sub || '').trim();
    const ownerUserId = String(payload?.ownerUserId || '').trim();
    if (!daemonId || !ownerUserId) {
      return { ok: false, error: 'Invalid daemon bearer token' };
    }
    return { ok: true, daemonId, ownerUserId };
  } catch {
    return { ok: false, error: 'Invalid daemon bearer token' };
  }
}

function normalizeStringList(values) {
  const normalizedInput = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/[\s,;]+/)
      : [];
  return [...new Set(normalizedInput
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeDaemonRecord(existing, update) {
  const now = new Date().toISOString();
  return {
    daemonId: String(update.daemonId || existing?.daemonId || '').trim(),
    hostname: String(update.hostname || existing?.hostname || update.daemonId || 'unknown').trim(),
    platform: String(update.platform || existing?.platform || '').trim(),
    agents: normalizeStringList(update.agents || existing?.agents || []),
    workspaces: normalizeStringList(update.workspaces || existing?.workspaces || []),
    online: update.online ?? existing?.online ?? false,
    createdAt: existing?.createdAt || now,
    updatedAt: update.updatedAt || now,
    lastSeenAt: update.lastSeenAt || now,
  };
}

function normalizeSessionRecord(existing, update) {
  const now = new Date().toISOString();
  return {
    sessionId: String(update.sessionId || existing?.sessionId || '').trim(),
    roomName: String(update.roomName || existing?.roomName || 'Session').trim() || 'Session',
    daemonId: String(update.daemonId || existing?.daemonId || '').trim(),
    agentName: String(update.agentName || existing?.agentName || '').trim(),
    workingDirectory: String(update.workingDirectory || existing?.workingDirectory || '').trim(),
    ownerUserId: String(update.ownerUserId || existing?.ownerUserId || '').trim(),
    participants: normalizeStringList(update.participants || existing?.participants || []),
    createdAt: existing?.createdAt || now,
    updatedAt: update.updatedAt || now,
    deletedAt: update.deletedAt ?? existing?.deletedAt ?? null,
  };
}

function getPortalUser(req) {
  if (OAUTH_ENABLED) {
    if (req.session?.user?.login) {
      return {
        login: String(req.session.user.login),
        name: String(req.session.user.name || req.session.user.login),
        avatar: req.session.user.avatar || '',
      };
    }
    return null;
  }
  const userId = String(req.get(PORTAL_USER_HEADER) || req.query.userId || '').trim();
  if (!userId || validateNegotiatedUserId(userId)) return null;
  return {
    login: userId,
    name: userId,
    avatar: '',
  };
}

function requirePortalUser(req, res) {
  if (!OAUTH_ENABLED) {
    const userId = String(req.get(PORTAL_USER_HEADER) || req.query.userId || '').trim();
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return null;
    }
    const error = validateNegotiatedUserId(userId);
    if (error) {
      res.status(400).json({ error });
      return null;
    }
    return {
      login: userId,
      name: userId,
      avatar: '',
    };
  }
  const user = getPortalUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

function validateNegotiatedUserId(userId) {
  if (String(userId) === ADMIN_USER_ID) {
    return 'reserved userId is not allowed';
  }
  if (!VALID_USER_ID.test(String(userId))) {
    return 'userId must match /^[a-zA-Z0-9_-]{1,64}$/';
  }
  return '';
}

function isAlreadyMemberError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('already') || message.includes('exists') || message.includes('member');
}

function daemonResponseForUser(daemon, accessState, user, requestState = null) {
  const hasAdminAccess = canAdminDaemonAccess(accessState, user.login);
  const hasMemberAccess = canMemberDaemonAccess(accessState, user.login);
  const canManage = canManageDaemonAccess(accessState, user.login);
  const approverUserIds = [...new Set([
    accessState.ownerUserId,
    ...(accessState.adminUsers || []),
  ].filter(Boolean))];
  return {
    daemonId: daemon.daemonId,
    ownerUserId: accessState.ownerUserId,
    approverUserIds,
    hostname: daemon.hostname,
    platform: daemon.platform,
    agents: daemon.agents || [],
    workspaces: daemon.workspaces || [],
    updatedAt: daemon.updatedAt,
    hasMemberAccess,
    hasAdminAccess,
    canRead: hasMemberAccess,
    canWrite: hasAdminAccess,
    canManage,
    memberUsers: canManage ? (accessState.memberUsers || []) : [],
    adminUsers: canManage ? (accessState.adminUsers || []) : [],
    readerUsers: canManage ? (accessState.memberUsers || []) : [],
    writerUsers: canManage ? (accessState.adminUsers || []) : [],
    accessRequestStatus: requestState?.status || '',
    requestedAccess: requestState?.requestedAccess || '',
  };
}

function buildDaemonLobbyEnvelope(daemon, accessState = null) {
  const approverUserIds = accessState
    ? [...new Set([
      accessState.ownerUserId,
      ...(accessState.adminUsers || []),
    ].filter(Boolean))]
    : undefined;
  return {
    type: 'portal.daemon',
    daemonId: daemon.daemonId,
    ownerUserId: accessState?.ownerUserId || daemon.ownerUserId || '',
    hostname: daemon.hostname,
    platform: daemon.platform,
    agents: daemon.agents || [],
    workspaces: daemon.workspaces || [],
    updatedAt: daemon.updatedAt || new Date().toISOString(),
    online: daemon.online !== false,
    ...(approverUserIds ? { approverUserIds } : {}),
  };
}

async function sendDaemonLobbyEnvelope(daemon, accessState = null) {
  const envelope = buildDaemonLobbyEnvelope(daemon, accessState);
  if (!envelope.daemonId) return;
  await sendLobbyEnvelope(envelope);
}

function isSessionOwner(sessionRecord, userId) {
  return !!sessionRecord && !!userId && sessionRecord.ownerUserId === userId;
}

function canManageSession(sessionRecord, daemonAccessState, userId) {
  return isSessionOwner(sessionRecord, userId) || canAdminDaemonAccess(daemonAccessState, userId);
}

function isUserJoinedToSession(sessionRecord, userId) {
  if (!sessionRecord || !userId) return false;
  return sessionRecord.ownerUserId === userId || (sessionRecord.participants || []).includes(userId);
}

function markDaemonOfflineIfStale(daemon) {
  const lastSeenAt = Date.parse(daemon?.lastSeenAt || '');
  if (!Number.isFinite(lastSeenAt)) return daemon;
  if (Date.now() - lastSeenAt > DAEMON_HEARTBEAT_STALE_MS && daemon.online) {
    return {
      ...daemon,
      online: false,
    };
  }
  return daemon;
}

const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

let adminChat = null;
let adminChatInitPromise = null;
let adminReconnectTimer = null;
let adminReconnectAttempt = 0;
let adminShuttingDown = false;

const pendingWorkspaceLookups = new Map();
const daemonAccessStateCache = new Map();
const knownDaemonIds = new Set();
const sessionIndexState = createSessionIndexState();

let sessionIndexHydrationPromise = null;

function rememberDaemonId(daemonId = '') {
  const normalizedDaemonId = String(daemonId || '').trim();
  if (!normalizedDaemonId) return '';
  knownDaemonIds.add(normalizedDaemonId);
  return normalizedDaemonId;
}

function rememberDaemonRoomInfo(roomInfo) {
  if (!roomInfo?.roomId?.startsWith('daemon-acl-')) return '';
  const parsedTitle = parseDaemonAclRoomTitle(roomInfo.title || roomInfo.name || '');
  return rememberDaemonId(parsedTitle?.daemonId || roomInfo.roomId.slice('daemon-acl-'.length));
}

function invalidateDaemonAccessStateCache(daemonId = '') {
  const normalizedDaemonId = String(daemonId || '').trim();
  if (!normalizedDaemonId) {
    daemonAccessStateCache.clear();
    return;
  }
  daemonAccessStateCache.delete(normalizedDaemonId);
}

async function ensureSessionIndicesReady({ forceRefresh = false } = {}) {
  if (sessionIndexHydrationPromise) {
    return await sessionIndexHydrationPromise;
  }
  if (!forceRefresh && sessionIndexState.hydratedAt) {
    return sessionIndexState;
  }

  sessionIndexHydrationPromise = (async () => {
    await hydrateSessionIndices({
      state: sessionIndexState,
      roomInfos: await listSessionRoomInfos(),
      parseSessionRoomTitle,
      loadSessionMembers: async (sessionId) => await listSessionRoomMembers(sessionId),
      loadJoinRequests: async (sessionId) => await readJoinRequestsForSession(sessionId),
      adminUserId: ADMIN_USER_ID,
    });
    return sessionIndexState;
  })();

  try {
    return await sessionIndexHydrationPromise;
  } finally {
    sessionIndexHydrationPromise = null;
  }
}

function getIndexedSessionRecord(sessionId) {
  const sessionRecord = sessionIndexState.directoryBySessionId.get(String(sessionId || '').trim());
  return sessionRecord && !sessionRecord.deletedAt ? sessionRecord : null;
}

function warmSessionIndexInBackground(reason = 'startup') {
  void ensureSessionIndicesReady({ forceRefresh: true }).catch((error) => {
    console.warn(`[Web] Session index warmup failed during ${reason}:`, error?.message || error);
  });
}

function cacheDaemonAccessState(daemonId, accessState) {
  daemonAccessStateCache.set(daemonId, {
    value: accessState,
    expiresAt: Date.now() + DAEMON_ACCESS_STATE_CACHE_TTL_MS,
  });
  return accessState;
}

function createServiceRestToken(audience) {
  return jsonwebtoken.sign({}, portalAccessKey, {
    audience,
    expiresIn: '1h',
    algorithm: 'HS256',
  });
}

async function chatRestRequest(path, { method = 'GET', body, allow404 = false } = {}) {
  const url = new URL(path, serviceClient.endpoint);
  url.searchParams.set('api-version', CHAT_REST_API_VERSION);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${createServiceRestToken(url.toString())}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (allow404 && response.status === 404) {
      return null;
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (response.ok) {
      return payload;
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (shouldRetry && attempt < 4) {
      const retryAfterHeader = Number(response.headers.get('Retry-After') || '0');
      const retryDelayMs = retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 250 * (2 ** attempt);
      await new Promise((resolveRetry) => setTimeout(resolveRetry, retryDelayMs));
      continue;
    }

    const error = new Error(payload?.error || payload?.message || text || `Chat REST request failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  throw new Error('Chat REST request failed after retries');
}

function isNotFoundError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  if (statusCode === 404) return true;
  const message = String(error?.message || '').toLowerCase();
  const errorName = String(error?.errorDetail?.name || error?.name || '').toLowerCase();
  return message.includes('404')
    || message.includes('not found')
    || message.includes('not a member of the specified room')
    || errorName === 'usernotinroom';
}

function normalizeChatRoomMembers(payload) {
  const rawMembers = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload?.members)
        ? payload.members
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

  return rawMembers.map((member) => ({
    userId: String(member?.userId || member?.id || '').trim(),
    role: String(member?.role || 'room.member').trim() || 'room.member',
  })).filter((member) => member.userId);
}

async function getChatRoomInfo(roomId) {
  return await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(roomId)}`,
    { allow404: true },
  );
}

async function getDaemonAclRoomInfo(daemonId) {
  return await getChatRoomInfo(daemonAclRoomId(daemonId));
}

async function listDaemonAclRoomMembers(daemonId) {
  const payload = await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(daemonAclRoomId(daemonId))}/members`,
    { allow404: true },
  );
  if (!payload) return null;
  return normalizeChatRoomMembers(payload);
}

async function upsertChatRoomMember(roomId, userId, role) {
  await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`,
    { method: 'PUT', body: { userId, role } },
  );
}

async function removeChatRoomMember(roomId, userId) {
  await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE', allow404: true },
  );
}

async function readDaemonAccessState(daemonId, fallbackOwnerUserId = '', { forceRefresh = false } = {}) {
  const normalizedDaemonId = String(daemonId || '').trim();
  if (!normalizedDaemonId) return null;

  if (forceRefresh) {
    daemonAccessStateCache.delete(normalizedDaemonId);
  } else {
    const cached = daemonAccessStateCache.get(normalizedDaemonId);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.promise) {
        return await cached.promise;
      }
      return cached.value ?? null;
    }
  }

  const loadPromise = (async () => {
    const roomInfo = await getDaemonAclRoomInfo(normalizedDaemonId);
    if (!roomInfo) return null;
    const members = await listDaemonAclRoomMembers(normalizedDaemonId) || [];
    return deriveDaemonAclState({
      daemonId: normalizedDaemonId,
      roomTitle: String(roomInfo.title || roomInfo.name || ''),
      members,
      adminUserId: ADMIN_USER_ID,
      fallbackOwnerUserId,
    });
  })();

  daemonAccessStateCache.set(normalizedDaemonId, {
    promise: loadPromise,
    expiresAt: Date.now() + DAEMON_ACCESS_STATE_CACHE_TTL_MS,
  });

  try {
    return cacheDaemonAccessState(normalizedDaemonId, await loadPromise);
  } catch (error) {
    daemonAccessStateCache.delete(normalizedDaemonId);
    throw error;
  }
}

async function ensureDaemonAclState(daemonId, requestedOwnerUserId = '', existingRecord = null) {
  const fallbackOwnerUserId = String(requestedOwnerUserId || existingRecord?.ownerUserId || '').trim();
  let roomInfo = await getDaemonAclRoomInfo(daemonId);

  if (!roomInfo) {
    if (!fallbackOwnerUserId || fallbackOwnerUserId === ADMIN_USER_ID || !VALID_USER_ID.test(fallbackOwnerUserId)) {
      throw new Error(`Daemon ${daemonId} is missing a valid owner userId`);
    }

    roomInfo = await adminCreateRoom(
      buildDaemonAclRoomTitle({ daemonId, ownerUserId: fallbackOwnerUserId }),
      [ADMIN_USER_ID, fallbackOwnerUserId],
      daemonAclRoomId(daemonId),
    );

    const desiredMembers = buildDesiredDaemonAclMembers({
      ownerUserId: fallbackOwnerUserId,
      memberUsers: existingRecord?.memberUsers || existingRecord?.readerUsers || [],
      adminUsers: existingRecord?.adminUsers || existingRecord?.writerUsers || [],
      adminUserId: ADMIN_USER_ID,
    });

    for (const member of desiredMembers) {
      await upsertChatRoomMember(daemonAclRoomId(daemonId), member.userId, member.role);
    }
  }

  const accessState = await readDaemonAccessState(daemonId, fallbackOwnerUserId);
  if (!accessState) {
    throw new Error(`Failed to load daemon access state for ${daemonId}`);
  }

  if (!(accessState.members || []).some((member) => member.userId === ADMIN_USER_ID)) {
    await upsertChatRoomMember(accessState.roomId, ADMIN_USER_ID, 'room.operator');
    invalidateDaemonAccessStateCache(daemonId);
    return await readDaemonAccessState(daemonId, fallbackOwnerUserId, { forceRefresh: true });
  }

  if (requestedOwnerUserId && accessState.ownerUserId && requestedOwnerUserId !== accessState.ownerUserId) {
    const error = new Error(`Daemon ${daemonId} is already owned by ${accessState.ownerUserId}`);
    error.code = 'DAEMON_OWNER_CONFLICT';
    throw error;
  }

  if (accessState.ownerUserId) {
    return accessState;
  }

  if (!fallbackOwnerUserId || fallbackOwnerUserId === ADMIN_USER_ID || !VALID_USER_ID.test(fallbackOwnerUserId)) {
    throw new Error(`Daemon ${daemonId} is missing an owner in Chat membership state`);
  }

  await upsertChatRoomMember(accessState.roomId, fallbackOwnerUserId, 'room.operator');
  invalidateDaemonAccessStateCache(daemonId);
  return await readDaemonAccessState(daemonId, fallbackOwnerUserId, { forceRefresh: true });
}

async function updateDaemonAclState(daemonId, accessState, memberUsers, adminUsers) {
  await upsertChatRoomMember(accessState.roomId, accessState.ownerUserId, 'room.operator');

  const desiredMembers = buildDesiredDaemonAclMembers({
    ownerUserId: accessState.ownerUserId,
    memberUsers,
    adminUsers,
    adminUserId: ADMIN_USER_ID,
  });
  const desiredRoleByUserId = new Map(desiredMembers.map((member) => [member.userId, member.role]));
  desiredRoleByUserId.delete(accessState.ownerUserId);

  for (const member of accessState.members || []) {
    if (!member?.userId || member.userId === ADMIN_USER_ID || member.userId === accessState.ownerUserId) continue;
    const desiredRole = desiredRoleByUserId.get(member.userId);
    if (!desiredRole) {
      await removeChatRoomMember(accessState.roomId, member.userId);
      continue;
    }
    if (desiredRole !== member.role) {
      await upsertChatRoomMember(accessState.roomId, member.userId, desiredRole);
    }
    desiredRoleByUserId.delete(member.userId);
  }

  for (const [userId, role] of desiredRoleByUserId.entries()) {
    await upsertChatRoomMember(accessState.roomId, userId, role);
  }

  invalidateDaemonAccessStateCache(daemonId);
  return await readDaemonAccessState(daemonId, accessState.ownerUserId, { forceRefresh: true });
}

function buildDaemonAccessRequestEnvelope(payload) {
  return {
    type: 'portal.daemon-access-request',
    requestId: String(payload.requestId || '').trim(),
    daemonId: String(payload.daemonId || '').trim(),
    requesterUserId: String(payload.requesterUserId || '').trim(),
    ownerUserId: String(payload.ownerUserId || '').trim(),
    requestedAccess: String(payload.requestedAccess || '').trim(),
    status: String(payload.status || '').trim(),
    createdAt: String(payload.createdAt || '').trim(),
    updatedAt: String(payload.updatedAt || '').trim(),
  };
}

function parseDaemonAccessRequestEnvelope(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (parsed?.type !== 'portal.daemon-access-request') return null;
    const envelope = buildDaemonAccessRequestEnvelope(parsed);
    if (!envelope.requestId || !envelope.daemonId || !envelope.requesterUserId || !envelope.requestedAccess || !envelope.status) {
      return null;
    }
    return envelope;
  } catch {
    return null;
  }
}

async function readDaemonAccessRequests(daemonId) {
  const messages = await listRoomMessages(daemonAclRoomId(daemonId), 200);
  const requestsById = new Map();
  for (const message of messages) {
    if (!message?.content?.text) continue;
    const envelope = parseDaemonAccessRequestEnvelope(message.content.text);
    if (!envelope || envelope.daemonId !== daemonId) continue;
    const current = requestsById.get(envelope.requestId);
    if (!current || String(envelope.updatedAt || '').localeCompare(String(current.updatedAt || '')) >= 0) {
      requestsById.set(envelope.requestId, envelope);
    }
  }
  return [...requestsById.values()];
}

async function getLatestDaemonAccessRequestForUser(daemonId, requesterUserId) {
  const requests = await readDaemonAccessRequests(daemonId);
  return requests
    .filter((request) => request.requesterUserId === requesterUserId)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0] || null;
}

async function appendDaemonAccessRequestEvent(daemonId, payload) {
  const envelope = buildDaemonAccessRequestEnvelope(payload);
  await adminSendToRoom(daemonAclRoomId(daemonId), JSON.stringify(envelope), 'appendDaemonAccessRequestEvent');
  return envelope;
}

function buildSessionRoomTitle({ roomName, daemonId, agentName, workingDirectory, ownerUserId, createdAt = '', updatedAt = '' }) {
  return JSON.stringify({
    t: 'ms',
    r: String(roomName || 'Session').trim() || 'Session',
    d: String(daemonId || '').trim(),
    a: String(agentName || '').trim(),
    w: String(workingDirectory || '').trim(),
    o: String(ownerUserId || '').trim(),
    c: String(createdAt || '').trim(),
    u: String(updatedAt || '').trim(),
  });
}

function parseSessionRoomTitle(title) {
  try {
    const parsed = JSON.parse(String(title || ''));
    if (parsed?.type !== 'managed-session' && parsed?.t !== 'ms') return null;
    return {
      roomName: String(parsed.r || parsed.roomName || 'Session').trim() || 'Session',
      daemonId: String(parsed.d || parsed.daemonId || '').trim(),
      agentName: String(parsed.a || parsed.agentName || '').trim(),
      workingDirectory: String(parsed.w || parsed.workingDirectory || '').trim(),
      ownerUserId: String(parsed.o || parsed.ownerUserId || '').trim(),
      createdAt: String(parsed.c || parsed.createdAt || '').trim(),
      updatedAt: String(parsed.u || parsed.updatedAt || '').trim(),
    };
  } catch {
    return null;
  }
}

function buildJoinRequestEnvelope(payload) {
  return {
    type: 'portal.join-request',
    requestId: String(payload.requestId || '').trim(),
    sessionId: String(payload.sessionId || '').trim(),
    requesterUserId: String(payload.requesterUserId || '').trim(),
    ownerUserId: String(payload.ownerUserId || '').trim(),
    daemonId: String(payload.daemonId || '').trim(),
    agentName: String(payload.agentName || '').trim(),
    workingDirectory: String(payload.workingDirectory || '').trim(),
    roomName: String(payload.roomName || 'Session').trim() || 'Session',
    requestedAccess: String(payload.requestedAccess || '').trim(),
    status: String(payload.status || '').trim(),
    createdAt: String(payload.createdAt || '').trim(),
    updatedAt: String(payload.updatedAt || '').trim(),
  };
}

function parseJoinRequestEnvelope(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (parsed?.type !== 'portal.join-request') return null;
    const envelope = buildJoinRequestEnvelope(parsed);
    if (!envelope.requestId || !envelope.requesterUserId || !envelope.status) return null;
    return envelope;
  } catch {
    return null;
  }
}

async function listSessionRoomMembers(sessionId) {
  const payload = await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(sessionId)}/members`,
    { allow404: true },
  );
  if (!payload) return [];
  return normalizeChatRoomMembers(payload);
}

function normalizeManagedRoomInfos(rooms) {
  return [...new Map((rooms || [])
    .filter((room) => room?.roomId)
    .map((room) => [room.roomId, room])).values()];
}

async function listManagedRoomInfos() {
  await ensureAdminChatReady();
  const roomInfos = normalizeManagedRoomInfos(adminChat?.rooms || []);
  for (const roomInfo of roomInfos) {
    rememberDaemonRoomInfo(roomInfo);
  }
  return roomInfos;
}

async function listFreshManagedRoomInfos() {
  const chat = await loginEphemeralAdminChat();
  try {
    const roomInfos = normalizeManagedRoomInfos(chat?.rooms || []);
    for (const roomInfo of roomInfos) {
      rememberDaemonRoomInfo(roomInfo);
    }
    return roomInfos;
  } finally {
    await stopChatClient(chat);
  }
}

async function listDaemonRegistryRecords() {
  return await listDaemonRegistryRecordsWithFallback({
    listManagedRoomInfos,
    listFreshManagedRoomInfos,
    knownDaemonIds,
    rememberDaemonRoomInfo,
    getDaemonRegistryRecord,
    warn: (daemonId, error) => {
      console.warn(`[Web] Failed to load daemon registry record for ${daemonId}:`, error?.message || error);
    },
  });
}

async function getDaemonRegistryRecord(daemonId) {
  const normalizedDaemonId = rememberDaemonId(daemonId);
  if (!normalizedDaemonId) return null;
  const roomInfo = await getDaemonAclRoomInfo(normalizedDaemonId);
  if (!roomInfo) return null;
  rememberDaemonRoomInfo(roomInfo);
  const parsedTitle = parseDaemonAclRoomTitle(roomInfo.title || roomInfo.name || '');
  const accessState = await readDaemonAccessState(normalizedDaemonId, parsedTitle?.ownerUserId || '');
  if (!accessState) return null;
  return {
    daemonId: normalizedDaemonId,
    ownerUserId: accessState.ownerUserId,
    hostname: parsedTitle?.hostname || normalizedDaemonId,
    platform: parsedTitle?.platform || '',
    agents: parsedTitle?.agents || [],
    workspaces: parsedTitle?.workspaces || [],
    online: parsedTitle?.online !== false,
    updatedAt: parsedTitle?.updatedAt || '',
    lastSeenAt: parsedTitle?.lastSeenAt || '',
    accessState,
  };
}

async function writeDaemonRegistryRecord({ daemonId, ownerUserId, hostname, platform, agents, workspaces, online, updatedAt, lastSeenAt }, existingRecord = null) {
  const normalizedDaemonId = rememberDaemonId(daemonId);
  const accessState = await ensureDaemonAclState(normalizedDaemonId, ownerUserId, existingRecord);
  // Ensure the daemon bot itself is a member of the daemon-acl room so it can
  // broadcast session status (session.touch) directly to the sync room.
  try {
    await upsertChatRoomMember(daemonAclRoomId(normalizedDaemonId), normalizedDaemonId, 'room.member');
  } catch (err) {
    if (!/already|exists|member/i.test(String(err?.message || ''))) {
      console.warn('[Web] Failed to add daemon bot to ACL room:', err?.message);
    }
  }
  const title = buildDaemonAclRoomTitle({
    daemonId: normalizedDaemonId,
    ownerUserId: accessState.ownerUserId,
    hostname,
    platform,
    agents,
    workspaces,
    online,
    updatedAt,
    lastSeenAt,
  });
  await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(accessState.roomId)}`,
    { method: 'PATCH', body: { title } },
  );
  if (Array.isArray(adminChat?.rooms)) {
    const cachedRoom = adminChat.rooms.find((room) => room?.roomId === accessState.roomId);
    if (cachedRoom) {
      cachedRoom.title = title;
      cachedRoom.name = title;
    }
  }
  return await getDaemonRegistryRecord(normalizedDaemonId);
}

async function listSessionRoomInfos() {
  const roomInfos = await listManagedRoomInfos();
  return roomInfos.filter((roomInfo) => parseSessionRoomTitle(roomInfo?.title || roomInfo?.name || ''));
}

async function listConversationMessages(conversationId, startId, endId, maxCount = 100) {
  const params = new URLSearchParams();
  if (startId != null) params.set('start', String(startId));
  if (endId != null) params.set('end', String(endId));
  params.set('maxCount', String(Math.max(1, Number(maxCount) || 1)));

  return await chatRestRequest(
    `/api/hubs/${encodeURIComponent(hubName)}/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  );
}

async function listRoomMessages(roomId, maxCount = 200) {
  return await listRoomMessagesWithFallback({
    roomId,
    maxCount,
    baseUrl: serviceClient.endpoint,
    loadPrimaryPage: async (targetRoomId, startId, endId, pageSize) => await adminListRoomMessage(targetRoomId, startId, endId, pageSize),
    loadRoomInfo: async (targetRoomId) => await getChatRoomInfo(targetRoomId),
    loadConversationPage: async (conversationId, startId, endId, pageSize) => await listConversationMessages(conversationId, startId, endId, pageSize),
  });
}

function delegationTargetLabel(sessionRecord, daemonRecord = null) {
  const roomName = String(sessionRecord?.roomName || 'Session').trim() || 'Session';
  const daemonLabel = String(daemonRecord?.hostname || sessionRecord?.daemonId || '').trim();
  return daemonLabel ? `${roomName} @ ${daemonLabel}` : roomName;
}

function delegationStatusFromControlType(type) {
  const normalizedType = String(type || '').trim();
  if (normalizedType === 'control.delegation.created') return 'creating';
  if (normalizedType === 'control.delegation.dispatched') return 'dispatched';
  if (normalizedType === 'control.delegation.started') return 'started';
  if (normalizedType === 'control.delegation.cancel_requested') return 'cancel_requested';
  if (normalizedType === 'control.delegation.completed') return 'completed';
  if (normalizedType === 'control.delegation.failed') return 'failed';
  if (normalizedType === 'control.delegation.cancelled') return 'cancelled';
  if (normalizedType === 'control.delegation.expired') return 'expired';
  return '';
}

async function ensureChatRoomWithMembers(roomId, roomName, members = []) {
  const normalizedRoomId = String(roomId || '').trim();
  if (!normalizedRoomId) throw new Error('roomId is required');
  const normalizedMembers = [...new Map((members || [])
    .map((member) => ({
      userId: String(member?.userId || '').trim(),
      role: String(member?.role || 'room.member').trim() || 'room.member',
    }))
    .filter((member) => member.userId)
    .map((member) => [member.userId, member])).values()];

  let roomInfo = await getChatRoomInfo(normalizedRoomId);
  if (!roomInfo) {
    try {
      roomInfo = await adminCreateRoom(
        String(roomName || normalizedRoomId).trim() || normalizedRoomId,
        normalizedMembers.map((member) => member.userId),
        normalizedRoomId,
      );
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already') && !message.includes('exists')) {
        throw error;
      }
      roomInfo = await getChatRoomInfo(normalizedRoomId);
    }
  }

  for (const member of normalizedMembers) {
    await upsertChatRoomMember(normalizedRoomId, member.userId, member.role);
  }

  return roomInfo || await getChatRoomInfo(normalizedRoomId);
}

async function ensureDelegationControlRoom(targetDaemonId = '') {
  const members = [
    { userId: ADMIN_USER_ID, role: 'room.operator' },
  ];
  if (String(targetDaemonId || '').trim()) {
    members.push({ userId: String(targetDaemonId || '').trim(), role: 'room.member' });
  }
  return await ensureChatRoomWithMembers(DELEGATION_CONTROL_ROOM_ID, 'Delegation Control', members);
}

async function appendDelegationControlEvent(payload) {
  const envelope = buildDelegationControlEnvelope(payload);
  await ensureDelegationControlRoom(envelope.targetDaemonId);
  await adminSendToRoom(DELEGATION_CONTROL_ROOM_ID, JSON.stringify(envelope), 'appendDelegationControlEvent');
  return envelope;
}

async function appendDelegationSummaryEvent(sessionId, payload) {
  const envelope = buildDelegationSummaryEnvelope(payload);
  await adminSendToRoom(String(sessionId || '').trim(), JSON.stringify(envelope), 'appendDelegationSummaryEvent');
  return envelope;
}

async function listDelegationControlEvents(maxCount = 400) {
  try {
    const messages = await listRoomMessages(DELEGATION_CONTROL_ROOM_ID, maxCount);
    return messages
      .map((message) => {
        const envelope = parseDelegationControlEnvelope(message?.content?.text || '');
        if (!envelope) return null;
        return {
          ...envelope,
          messageId: String(message?.messageId || '').trim(),
          createdBy: String(message?.createdBy || '').trim(),
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('404') || message.includes('not found')) {
      return [];
    }
    throw error;
  }
}

function reduceDelegationControlEvents(events, delegationId = '') {
  const targetDelegationId = String(delegationId || '').trim();
  const records = new Map();

  for (const event of events || []) {
    if (!event?.delegationId) continue;
    if (targetDelegationId && event.delegationId !== targetDelegationId) continue;

    const existing = records.get(event.delegationId) || {
      delegationId: event.delegationId,
      sourceSessionId: event.sourceSessionId,
      targetSessionId: event.targetSessionId,
      relayRoomId: event.relayRoomId,
      requesterUserId: event.requesterUserId,
      targetDaemonId: event.targetDaemonId,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
      status: delegationStatusFromControlType(event.type) || 'creating',
      terminalStatus: '',
      cancelRequestedAt: '',
      targetLabel: '',
      prompt: '',
      displayText: '',
      terminalData: undefined,
    };

    existing.sourceSessionId = existing.sourceSessionId || event.sourceSessionId;
    existing.targetSessionId = existing.targetSessionId || event.targetSessionId;
    existing.relayRoomId = existing.relayRoomId || event.relayRoomId;
    existing.requesterUserId = existing.requesterUserId || event.requesterUserId;
    existing.targetDaemonId = existing.targetDaemonId || event.targetDaemonId;
    existing.updatedAt = event.createdAt || existing.updatedAt;

    if (event.data && typeof event.data === 'object') {
      existing.targetLabel = existing.targetLabel || String(event.data.targetLabel || '').trim();
      existing.prompt = existing.prompt || String(event.data.prompt || '').trim();
      existing.displayText = existing.displayText || String(event.data.displayText || '').trim();
      if (isDelegationTerminalStatus(event.data.status)) {
        existing.terminalStatus = String(event.data.status).trim();
      }
      if (event.data.summary && typeof event.data.summary === 'object') {
        existing.terminalData = {
          ...(existing.terminalData || {}),
          summary: event.data.summary,
        };
      }
    }

    const nextStatus = delegationStatusFromControlType(event.type);
    if (nextStatus) {
      existing.status = nextStatus;
    }

    if (event.type === 'control.delegation.cancel_requested') {
      existing.cancelRequestedAt = event.createdAt;
    }

    if (isDelegationTerminalStatus(nextStatus)) {
      existing.terminalStatus = nextStatus;
      existing.status = nextStatus;
      existing.terminalData = {
        ...(existing.terminalData || {}),
        ...(event.data && typeof event.data === 'object' ? event.data : {}),
      };
    }

    records.set(event.delegationId, existing);
  }

  return targetDelegationId ? records.get(targetDelegationId) || null : records;
}

function collectDelegatingSourceSessionIds(delegationRecords) {
  const delegatingSourceSessionIds = new Set();
  const records = delegationRecords instanceof Map ? delegationRecords.values() : delegationRecords || [];
  for (const record of records) {
    const sourceSessionId = String(record?.sourceSessionId || '').trim();
    if (!sourceSessionId) continue;
    const currentStatus = String(record?.terminalStatus || record?.status || '').trim();
    if (isDelegationTerminalStatus(currentStatus)) continue;
    delegatingSourceSessionIds.add(sourceSessionId);
  }
  return delegatingSourceSessionIds;
}

async function syncDelegatingSessionState(sessionRecord) {
  if (!sessionRecord?.sessionId) return false;
  try {
    const delegationRecords = reduceDelegationControlEvents(await listDelegationControlEvents());
    const sessionDelegating = collectDelegatingSourceSessionIds(delegationRecords).has(sessionRecord.sessionId);
    await sendDaemonSyncEnvelope(sessionRecord, 'session.touch', {
      sessionDelegating,
      updatedAt: new Date().toISOString(),
    });
    return sessionDelegating;
  } catch (error) {
    console.warn('[Web] Failed to sync delegating session state:', error?.message || error);
    return false;
  }
}

async function readDelegationRecord(delegationId) {
  const events = await listDelegationControlEvents();
  return reduceDelegationControlEvents(events, delegationId);
}

async function readJoinRequestsForSession(sessionId) {
  const messages = await listRoomMessages(sessionId, 200);
  const requestsById = new Map();
  for (const message of messages) {
    if (!message?.content?.text) continue;
    const envelope = parseJoinRequestEnvelope(message.content.text);
    if (!envelope) continue;
    const current = requestsById.get(envelope.requestId);
    if (!current || String(envelope.updatedAt || '').localeCompare(String(current.updatedAt || '')) >= 0) {
      requestsById.set(envelope.requestId, envelope);
    }
  }
  return [...requestsById.values()];
}

async function appendJoinRequestEvent(sessionRecord, payload) {
  const envelope = buildJoinRequestEnvelope(payload);
  await invokeAdminChat('appendJoinRequestEvent', (chat) => chat.sendToRoom(sessionRecord.sessionId, JSON.stringify(envelope)));
  // Also broadcast to the daemon sync room so admins who are not currently
  // viewing this session still receive the request in real time.
  const daemonId = String(sessionRecord.daemonId || '').trim();
  if (daemonId) {
    try {
      await adminSendToRoom(daemonAclRoomId(daemonId), JSON.stringify(envelope), 'broadcastJoinRequest');
    } catch (err) {
      console.warn('[Web] Failed to broadcast join request to daemon sync room:', err.message);
    }
  }
  return envelope;
}

function settleWorkspaceLookup(requestId, error, data = {}) {
  const pending = pendingWorkspaceLookups.get(requestId);
  if (!pending) return false;
  clearTimeout(pending.timeout);
  pendingWorkspaceLookups.delete(requestId);
  if (error) pending.reject(new Error(error));
  else pending.resolve(data);
  return true;
}

async function sendLobbyEnvelope(envelope) {
  await adminSendToRoom(LOBBY_ROOM, JSON.stringify(envelope), 'sendLobbyEnvelope');
}

function buildSessionSyncEnvelope(sessionRecord, type = 'session.updated', extra = {}) {
  if (!sessionRecord?.daemonId || !sessionRecord?.sessionId) return null;
  return {
    type,
    sessionId: sessionRecord.sessionId,
    daemonId: sessionRecord.daemonId,
    agentName: sessionRecord.agentName,
    roomName: sessionRecord.roomName,
    workingDirectory: sessionRecord.workingDirectory,
    ownerUserId: sessionRecord.ownerUserId,
    updatedAt: extra.updatedAt || new Date().toISOString(),
    ...extra,
  };
}

async function sendDaemonSyncEnvelope(sessionRecord, type = 'session.updated', extra = {}) {
  const envelope = buildSessionSyncEnvelope(sessionRecord, type, extra);
  if (!envelope) return;
  try {
    await adminSendToRoom(daemonAclRoomId(sessionRecord.daemonId), JSON.stringify(envelope), 'sendDaemonSyncEnvelope');
  } catch (error) {
    console.warn('[Web] Failed to send daemon sync envelope:', error?.message || error);
  }
}

async function ensureLobbyAccess(userId) {
  if (!userId) return;
  try {
    await adminCreateRoom('Agent Lobby', [ADMIN_USER_ID, String(userId)], LOBBY_ROOM);
    return;
  } catch (error) {
    if (!isAlreadyMemberError(error)) {
      console.warn('[Web] createRoom during lobby ensure failed:', error?.message || error);
    }
  }
  try {
    await adminAddUserToRoom(LOBBY_ROOM, String(userId), 'ensureLobbyAccess');
  } catch (error) {
    if (!isAlreadyMemberError(error)) {
      throw error;
    }
  }
}

function bindAdminLobbyListeners() {
  if (!adminChat) return;
  adminChat.onConnected(() => {
    adminReconnectAttempt = 0;
    warmSessionIndexInBackground('admin-chat-connect');
  });
  adminChat.onDisconnected(() => {
    if (adminShuttingDown) return;
    console.warn('[Web] Admin chat disconnected; scheduling reconnect');
    adminChat = null;
    scheduleAdminReconnect();
  });
  adminChat.addListenerForNewMessage(async (notification) => {
    try {
      const roomId = notification.conversation?.roomId;
      const message = notification.message;
      if (!roomId || message?.createdBy === ADMIN_USER_ID || !message?.content?.text) return;
      const envelope = JSON.parse(message.content.text);
      if (envelope.type === 'workspace.list_response' && envelope.requestId) {
        settleWorkspaceLookup(envelope.requestId, envelope.error || '', {
          base: envelope.base,
          dirs: envelope.dirs || [],
          partial: envelope.partial || '',
          daemonId: envelope.daemonId,
          mode: envelope.mode || '',
          favorites: envelope.favorites || [],
          roots: envelope.roots || [],
          query: envelope.query || '',
          truncated: !!envelope.truncated,
          total: Number(envelope.total) || 0,
        });
      }
    } catch (error) {
      console.error('[Web] Admin listener error:', error?.message || error);
    }
  });
}

function scheduleAdminReconnect() {
  if (adminShuttingDown) return;
  if (adminReconnectTimer || adminChatInitPromise) return;
  const delay = Math.min(30000, 1000 * (2 ** adminReconnectAttempt));
  adminReconnectAttempt += 1;
  adminReconnectTimer = setTimeout(() => {
    adminReconnectTimer = null;
    void initAdminChat().catch((error) => {
      console.error('[Web] Admin chat reconnect failed:', error?.message || error);
      scheduleAdminReconnect();
    });
  }, delay);
  adminReconnectTimer.unref?.();
}

async function initAdminChat() {
  if (adminChat) return adminChat;
  if (adminChatInitPromise) return adminChatInitPromise;

  adminChatInitPromise = (async () => {
    if (adminShuttingDown) return null;
    const token = await serviceClient.getClientAccessToken({ userId: ADMIN_USER_ID });
    const loggedInChat = await new ChatClient(token.url).login();
    if (adminShuttingDown) {
      await stopChatClient(loggedInChat);
      return null;
    }
    adminChat = loggedInChat;
    console.log(`[Web] Admin chat logged in as: ${adminChat.userId}`);

    try {
      await adminChat.createRoom('Agent Lobby', [ADMIN_USER_ID], LOBBY_ROOM);
      console.log('[Web] Created lobby room');
    } catch {
      try { await adminChat.addUserToRoom(LOBBY_ROOM, ADMIN_USER_ID); } catch {}
    }

    bindAdminLobbyListeners();
    return adminChat;
  })().finally(() => {
    adminChatInitPromise = null;
  });

  return adminChatInitPromise;
}

async function ensureAdminChatReady() {
  if (adminChat) return adminChat;
  return initAdminChat();
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

async function loginEphemeralAdminChat() {
  const token = await serviceClient.getClientAccessToken({ userId: ADMIN_USER_ID });
  return await new ChatClient(token.url).login();
}

async function invokeAdminChat(label, operation, timeoutMs = 15_000) {
  const run = async (useEphemeral = false) => {
    const chat = useEphemeral ? await loginEphemeralAdminChat() : await ensureAdminChatReady();
    let timeoutHandle;
    const operationPromise = Promise.resolve().then(() => operation(chat));
    operationPromise.catch(() => {});
    try {
      return await Promise.race([
        operationPromise,
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (useEphemeral) {
        await stopChatClient(chat);
      }
    }
  };

  try {
    return await run(false);
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const shouldRetry = message.includes('disconnected') || message.includes('timed out');
    if (!shouldRetry) throw error;

    if (adminReconnectTimer) {
      clearTimeout(adminReconnectTimer);
      adminReconnectTimer = null;
    }
    await stopChatClient(adminChat);
    adminChat = null;
    return await run(true);
  }
}

async function adminCreateRoom(name, members, roomId) {
  return await invokeAdminChat(`createRoom:${roomId || name}`, (chat) => chat.createRoom(name, members, roomId), 20_000);
}

async function adminSendToRoom(roomId, payload, label = 'sendToRoom') {
  return await invokeAdminChat(`${label}:${roomId}`, (chat) => chat.sendToRoom(roomId, payload));
}

async function adminListRoomMessage(roomId, startId, endId, maxCount) {
  return await invokeAdminChat(`listRoomMessage:${roomId}`, (chat) => chat.listRoomMessage(roomId, startId, endId, maxCount));
}

async function adminAddUserToRoom(roomId, userId, label = 'addUserToRoom') {
  return await invokeAdminChat(`${label}:${roomId}:${userId}`, (chat) => chat.addUserToRoom(roomId, userId));
}

async function adminRemoveUserFromRoom(roomId, userId, label = 'removeUserFromRoom') {
  return await invokeAdminChat(`${label}:${roomId}:${userId}`, (chat) => chat.removeUserFromRoom(roomId, userId));
}

async function issueTokenResponse(res, userId, { ensureLobby = false, logLabel = 'Negotiate' } = {}) {
  const validationError = validateNegotiatedUserId(userId);
  if (validationError) {
    return res.status(validationError.includes('reserved') ? 403 : 400).json({ error: validationError });
  }
  try {
    if (ensureLobby) {
      await ensureLobbyAccess(String(userId));
    }
    const token = await serviceClient.getClientAccessToken({
      userId: String(userId),
      roles: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup'],
    });
    res.json({ url: token.url, userId: String(userId) });
  } catch (err) {
    console.error(`[${logLabel}] Error:`, err);
    res.status(500).json({ error: 'Failed to negotiate' });
  }
}

async function requestWorkspaceListing(daemonId, requesterUserId, pathValue = '', query = '') {
  const requestId = crypto.randomUUID();
  const pending = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingWorkspaceLookups.delete(requestId);
      reject(new Error('Directory lookup timed out'));
    }, WORKSPACE_REQUEST_TIMEOUT_MS);
    pendingWorkspaceLookups.set(requestId, { resolve, reject, timeout });
  });
  await adminSendToRoom(String(daemonId), JSON.stringify({
    type: 'workspace.list_request',
    requestId,
    requesterUserId,
    daemonId,
    path: pathValue || '__roots__',
    query,
    limit: 200,
  }), 'requestWorkspaceListing');
  return pending;
}

async function createManagedSession({ ownerUserId, daemonId, agentName, workingDirectory, roomName }) {
  const timestamp = new Date().toISOString();
  const room = await adminCreateRoom(
    buildSessionRoomTitle({
      roomName: String(roomName || 'Session'),
      daemonId,
      agentName,
      workingDirectory,
      ownerUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    [String(ownerUserId), String(daemonId), ADMIN_USER_ID],
  );
  const sessionRecord = normalizeSessionRecord(null, {
    sessionId: room.roomId,
    roomName: String(roomName || 'Session'),
    daemonId,
    agentName,
    workingDirectory,
    ownerUserId,
    participants: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await adminSendToRoom(room.roomId, JSON.stringify({
    type: 'control.create',
    userId: ownerUserId,
    agentName,
    workingDirectory: workingDirectory || undefined,
  }), 'createManagedSession.controlCreate');
  await sendDaemonSyncEnvelope(sessionRecord, 'session.created', { updatedAt: timestamp });
  return sessionRecord;
}

async function deleteManagedSession(sessionRecord) {
  if (!sessionRecord) return;
  try {
    await adminSendToRoom(sessionRecord.sessionId, JSON.stringify({ type: 'control.delete' }), 'deleteManagedSession.controlDelete');
  } catch (error) {
    console.warn('[Web] Failed to send control.delete:', error?.message || error);
  }
  try {
    await chatRestRequest(
      `/api/hubs/${encodeURIComponent(hubName)}/chat/rooms/${encodeURIComponent(sessionRecord.sessionId)}`,
      { method: 'DELETE', allow404: true },
    );
  } finally {
    if (Array.isArray(adminChat?.rooms)) {
      const roomIndex = adminChat.rooms.findIndex((room) => room?.roomId === sessionRecord.sessionId);
      if (roomIndex >= 0) {
        adminChat.rooms.splice(roomIndex, 1);
      }
    }
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));
app.use(express.static(publicRoot));

app.get('/chat-client.js', (req, res) => {
  sendJavaScriptAsset(res, 'chat-client.js', [
    join(publicRoot, 'chat-client.js'),
    join(__dirname, '..', '..', 'dist', 'browser', 'index.js'),
    join(__dirname, '..', '..', '..', 'dist', 'browser', 'index.js'),
  ]);
});

app.get('/marked.js', (req, res) => {
  sendJavaScriptAsset(res, 'marked.js', [
    join(publicRoot, 'marked.js'),
    join(__dirname, 'node_modules', 'marked', 'lib', 'marked.esm.js'),
    join(__dirname, '..', 'node_modules', 'marked', 'lib', 'marked.esm.js'),
  ]);
});

app.get('/dompurify.js', (req, res) => {
  sendJavaScriptAsset(res, 'dompurify.js', [
    join(publicRoot, 'dompurify.js'),
    join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.es.mjs'),
    join(__dirname, '..', 'node_modules', 'dompurify', 'dist', 'purify.es.mjs'),
  ]);
});

app.get('/auth/config', (req, res) => {
  res.json({
    oauth: OAUTH_ENABLED,
    clientId: OAUTH_ENABLED ? GITHUB_CLIENT_ID : undefined,
  });
});

app.get('/auth/login', (req, res) => {
  if (!OAUTH_ENABLED) return res.status(404).json({ error: oauthUnavailableMessage() });
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${req.protocol}://${req.get('host')}/auth/callback`,
    scope: 'read:user',
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  if (!OAUTH_ENABLED) return res.status(404).json({ error: oauthUnavailableMessage() });
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Invalid OAuth callback. <a href="/">Go back</a>');
  }
  delete req.session.oauthState;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
    });
    if (!userRes.ok) throw new Error(`GitHub API error: ${userRes.status}`);
    const user = await userRes.json();
    req.session.user = {
      id: String(user.id),
      login: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
    };
    console.log(`[Auth] GitHub login: ${user.login}`);
    res.redirect('/');
  } catch (err) {
    console.error('[Auth] OAuth error:', err.message);
    res.status(500).send(`Login failed: ${err.message}. <a href="/">Go back</a>`);
  }
});

app.get('/auth/me', (req, res) => {
  if (!OAUTH_ENABLED) return res.json({ oauth: false, user: getPortalUser(req) });
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ oauth: true, user: req.session.user });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get(/^\/negotiate:portal$/, async (req, res) => {
  let userId;
  if (OAUTH_ENABLED) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    userId = req.session.user.login;
  } else {
    userId = String(req.query.userId || req.get(PORTAL_USER_HEADER) || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId query parameter is required' });
    const invalidUserId = validateNegotiatedUserId(userId);
    if (invalidUserId) return res.status(400).json({ error: invalidUserId });
  }
  await issueTokenResponse(res, userId, { ensureLobby: true, logLabel: PORTAL_NEGOTIATE_PATH });
});

app.post('/api/daemon-sessions/bootstrap', async (req, res) => {
  const daemonId = String(req.body?.daemonId || '').trim();
  const ownerUserId = String(req.body?.ownerUserId || '').trim();
  if (!daemonId) return res.status(400).json({ error: 'daemonId is required' });
  if (!VALID_USER_ID.test(daemonId) || daemonId === ADMIN_USER_ID) {
    return res.status(400).json({ error: 'daemonId is invalid or reserved' });
  }
  if (!ownerUserId) return res.status(400).json({ error: 'ownerUserId is required' });
  if (!VALID_USER_ID.test(ownerUserId) || ownerUserId === ADMIN_USER_ID) {
    return res.status(400).json({ error: 'ownerUserId is invalid or reserved' });
  }
  try {
    const existing = await getDaemonRegistryRecord(daemonId);
    if (existing?.ownerUserId && existing.ownerUserId !== ownerUserId) {
      return res.status(409).json({ error: `Daemon ${daemonId} is already owned by ${existing.ownerUserId}` });
    }
  } catch (error) {
    console.error('[Web] Daemon bootstrap preflight failed:', error);
    return res.status(503).json({ error: error.message || 'Web PubSub Chat storage is unavailable' });
  }

  res.json({
    daemonId,
    ownerUserId,
    token: issueDaemonSessionToken(daemonId, ownerUserId),
  });
});

app.get(/^\/negotiate:daemon$/, async (req, res) => {
  res.status(410).json({ error: 'Deprecated. Daemons must use POST /api/daemons/register.' });
});

app.post('/api/daemons/register', async (req, res) => {
  const verification = parseDaemonSessionToken(req);
  if (!verification.ok) return res.status(403).json({ error: verification.error });
  const daemonId = verification.daemonId;
  const ownerUserId = verification.ownerUserId;
  let existing;
  try {
    existing = await getDaemonRegistryRecord(daemonId);
  } catch (error) {
    console.error('[Web] Daemon register preflight failed:', error);
    return res.status(503).json({ error: error.message || 'Web PubSub Chat storage is unavailable' });
  }
  let record;
  try {
    record = await writeDaemonRegistryRecord({
      daemonId,
      ownerUserId,
      hostname: req.body.hostname,
      platform: req.body.platform,
      agents: req.body.agents,
      workspaces: req.body.workspaces,
      online: true,
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    }, existing);
  } catch (error) {
    if (error?.code === 'DAEMON_OWNER_CONFLICT') {
      return res.status(409).json({ error: error.message });
    }
    console.error('[Web] Daemon register failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to initialize daemon in Web PubSub storage' });
  }
  try {
    try {
      await sendDaemonLobbyEnvelope(record);
    } catch (lobbyError) {
      console.warn('[Web] Daemon lobby notify failed:', lobbyError?.message || lobbyError);
    }
    const token = await serviceClient.getClientAccessToken({ userId: daemonId });
    res.json({
      daemon: {
        daemonId: record.daemonId,
        ownerUserId: record.ownerUserId,
        hostname: record.hostname,
        platform: record.platform,
      },
      url: token.url,
      userId: daemonId,
    });
  } catch (error) {
    console.error('[Web] Daemon register failed:', error);
    res.status(500).json({ error: 'Failed to issue daemon token' });
  }
});

app.post('/api/daemons/heartbeat', async (req, res) => {
  const verification = parseDaemonSessionToken(req);
  if (!verification.ok) return res.status(403).json({ error: verification.error });
  const daemonId = verification.daemonId;
  let existing;
  try {
    existing = await getDaemonRegistryRecord(daemonId);
  } catch (error) {
    console.error('[Web] Daemon heartbeat preflight failed:', error);
    return res.status(503).json({ error: error.message || 'Web PubSub Chat storage is unavailable' });
  }
  if (!existing) return res.status(404).json({ error: 'Daemon is not registered' });
  try {
    const record = await writeDaemonRegistryRecord({
      daemonId,
      ownerUserId: existing.ownerUserId || verification.ownerUserId,
      hostname: req.body.hostname,
      platform: req.body.platform,
      agents: req.body.agents,
      workspaces: req.body.workspaces,
      online: true,
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    }, existing);
    try {
      await sendDaemonLobbyEnvelope(record);
    } catch (lobbyError) {
      console.warn('[Web] Daemon lobby notify failed:', lobbyError?.message || lobbyError);
    }
  } catch (error) {
    if (error?.code === 'DAEMON_OWNER_CONFLICT') {
      return res.status(409).json({ error: error.message });
    }
    console.error('[Web] Daemon ACL heartbeat validation failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to validate daemon access state' });
  }
  res.json({ ok: true });
});

app.post('/api/daemons/offline', async (req, res) => {
  const verification = parseDaemonSessionToken(req);
  if (!verification.ok) return res.status(403).json({ error: verification.error });
  const daemonId = verification.daemonId;
  let existing;
  try {
    existing = await getDaemonRegistryRecord(daemonId);
  } catch (error) {
    console.error('[Web] Daemon offline preflight failed:', error);
    return res.status(503).json({ error: error.message || 'Web PubSub Chat storage is unavailable' });
  }
  if (!existing) return res.status(404).json({ error: 'Daemon is not registered' });
  try {
    const record = await writeDaemonRegistryRecord({
      daemonId,
      ownerUserId: existing.ownerUserId || verification.ownerUserId,
      hostname: existing.hostname,
      platform: existing.platform,
      agents: existing.agents,
      workspaces: existing.workspaces,
      online: false,
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    }, existing);
    try {
      await sendDaemonLobbyEnvelope(record);
    } catch (lobbyError) {
      console.warn('[Web] Daemon lobby notify failed:', lobbyError?.message || lobbyError);
    }
  } catch (error) {
    if (error?.code === 'DAEMON_OWNER_CONFLICT') {
      return res.status(409).json({ error: error.message });
    }
    console.error('[Web] Daemon ACL offline validation failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to validate daemon access state' });
  }
  res.json({ ok: true });
});

app.get('/api/daemons', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  let onlineDaemons;
  try {
    onlineDaemons = (await listDaemonRegistryRecords())
      .map((daemon) => markDaemonOfflineIfStale(daemon))
      .filter((daemon) => daemon && daemon.online)
      .sort((left, right) => String(left.hostname || left.daemonId).localeCompare(String(right.hostname || right.daemonId)));
  } catch (error) {
    console.error('[Web] Failed to list daemons:', error);
    return res.status(503).json({ error: error.message || 'Web PubSub Chat storage is unavailable' });
  }
  const daemons = (await Promise.all(onlineDaemons.map(async (daemon) => {
    try {
      const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
      const requestState = await getLatestDaemonAccessRequestForUser(daemon.daemonId, user.login);
      return daemonResponseForUser(daemon, accessState, user, requestState);
    } catch (error) {
      console.warn(`[Web] Failed to load daemon access state for ${daemon.daemonId}:`, error?.message || error);
      return null;
    }
  }))).filter(Boolean);
  res.json({ daemons });
});

app.patch('/api/daemons/:daemonId/access', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonId = String(req.params.daemonId || '').trim();
  const existing = await getDaemonRegistryRecord(daemonId);
  if (!existing) return res.status(404).json({ error: 'Daemon not found' });
  let accessState;
  try {
    accessState = await ensureDaemonAclState(daemonId, '', existing);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load daemon access state' });
  }
  if (!canManageDaemonAccess(accessState, user.login)) return res.status(403).json({ error: 'You are not allowed to manage this daemon' });

  let updatedAccessState;
  try {
    updatedAccessState = await updateDaemonAclState(
      daemonId,
      accessState,
      req.body?.memberUsers ?? req.body?.readerUsers,
      req.body?.adminUsers ?? req.body?.writerUsers,
    );
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update daemon access state' });
  }

  const record = normalizeDaemonRecord(existing, {
    daemonId: existing.daemonId,
    hostname: existing.hostname,
    platform: existing.platform,
    agents: existing.agents,
    workspaces: existing.workspaces,
    online: existing.online,
    updatedAt: new Date().toISOString(),
    lastSeenAt: existing.lastSeenAt,
  });
  await writeDaemonRegistryRecord({
    daemonId: record.daemonId,
    ownerUserId: updatedAccessState.ownerUserId,
    hostname: record.hostname,
    platform: record.platform,
    agents: record.agents,
    workspaces: record.workspaces,
    online: record.online,
    updatedAt: record.updatedAt,
    lastSeenAt: record.lastSeenAt,
  }, existing);
  try {
    await sendDaemonLobbyEnvelope(record, updatedAccessState);
  } catch (lobbyError) {
    console.warn('[Web] Daemon lobby notify failed:', lobbyError?.message || lobbyError);
  }
  res.json({ daemon: daemonResponseForUser(record, updatedAccessState, user) });
});

app.get('/api/daemon-access-requests', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const requests = [];
  for (const daemon of await listDaemonRegistryRecords()) {
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    if (!canManageDaemonAccess(accessState, user.login)) continue;
    for (const requestRecord of await readDaemonAccessRequests(daemon.daemonId)) {
      if (requestRecord.status !== 'pending') continue;
      requests.push(requestRecord);
    }
  }
  requests.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  res.json({ requests });
});

app.post('/api/daemons/:daemonId/access-requests', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonId = String(req.params.daemonId || '').trim();
  const rawRequestedAccess = String(req.body?.requestedAccess || '').trim().toLowerCase();
  const requestedAccess = rawRequestedAccess === 'reader' ? 'member'
    : rawRequestedAccess === 'writer' ? 'admin'
      : rawRequestedAccess;
  if (requestedAccess !== 'member' && requestedAccess !== 'admin') {
    return res.status(400).json({ error: 'requestedAccess must be member or admin' });
  }
  const daemon = markDaemonOfflineIfStale(await getDaemonRegistryRecord(daemonId));
  if (!daemon || !daemon.online) return res.status(404).json({ error: 'Daemon not found' });
  const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  const alreadyGranted = requestedAccess === 'admin'
    ? canAdminDaemonAccess(accessState, user.login)
    : canMemberDaemonAccess(accessState, user.login);
  if (alreadyGranted) {
    return res.json({ ok: true, status: 'approved', requestedAccess, requestId: '' });
  }
  const existing = await getLatestDaemonAccessRequestForUser(daemonId, user.login);
  if (existing?.status === 'pending' && existing.requestedAccess === requestedAccess) {
    return res.json({ ok: true, status: 'pending', requestedAccess, requestId: existing.requestId });
  }
  const requestId = crypto.randomUUID();
  await appendDaemonAccessRequestEvent(daemonId, {
    requestId,
    daemonId,
    requesterUserId: user.login,
    ownerUserId: accessState.ownerUserId,
    requestedAccess,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.json({ ok: true, status: 'pending', requestedAccess, requestId });
});

app.post('/api/daemons/:daemonId/access-requests/:requestId/approve', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonId = String(req.params.daemonId || '').trim();
  const requestId = String(req.params.requestId || '').trim();
  const daemon = await getDaemonRegistryRecord(daemonId);
  if (!daemon) return res.status(404).json({ error: 'Daemon not found' });
  const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  if (!canManageDaemonAccess(accessState, user.login)) return res.status(403).json({ error: 'Only a daemon manager can approve access requests' });
  const requestRecord = (await readDaemonAccessRequests(daemonId)).find((request) => request.requestId === requestId);
  if (!requestRecord) return res.status(404).json({ error: 'Access request not found' });
  const desiredRole = requestRecord.requestedAccess === 'admin' ? 'room.operator' : 'room.member';
  try {
    await upsertChatRoomMember(accessState.roomId, requestRecord.requesterUserId, desiredRole);
    invalidateDaemonAccessStateCache(daemonId);
    await appendDaemonAccessRequestEvent(daemonId, {
      ...requestRecord,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    });
    // Notify the requester in the lobby for immediate UI update
    try {
      await sendLobbyEnvelope({
        type: 'portal.access-approved',
        target: 'daemon',
        daemonId,
        requestId,
        requesterUserId: requestRecord.requesterUserId,
        requestedAccess: requestRecord.requestedAccess,
        status: 'approved',
      });
    } catch (lobbyErr) { console.warn('[Web] Lobby notify failed:', lobbyErr?.message); }
    res.json({ ok: true, status: 'approved', requestedAccess: requestRecord.requestedAccess });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to approve daemon access request' });
  }
});

app.post('/api/daemons/:daemonId/access-requests/:requestId/reject', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonId = String(req.params.daemonId || '').trim();
  const requestId = String(req.params.requestId || '').trim();
  const daemon = await getDaemonRegistryRecord(daemonId);
  if (!daemon) return res.status(404).json({ error: 'Daemon not found' });
  const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  if (!canManageDaemonAccess(accessState, user.login)) return res.status(403).json({ error: 'Only a daemon manager can reject access requests' });
  const requestRecord = (await readDaemonAccessRequests(daemonId)).find((request) => request.requestId === requestId);
  if (!requestRecord) return res.status(404).json({ error: 'Access request not found' });
  await appendDaemonAccessRequestEvent(daemonId, {
    ...requestRecord,
    status: 'denied',
    updatedAt: new Date().toISOString(),
  });
  try {
    await sendLobbyEnvelope({
      type: 'portal.access-denied',
      target: 'daemon',
      daemonId,
      requestId,
      requesterUserId: requestRecord.requesterUserId,
      requestedAccess: requestRecord.requestedAccess,
      status: 'denied',
    });
  } catch (lobbyErr) { console.warn('[Web] Lobby notify failed:', lobbyErr?.message); }
  res.json({ ok: true, status: 'denied', requestedAccess: requestRecord.requestedAccess });
});

app.get('/api/daemons/:daemonId/workspaces', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemon = markDaemonOfflineIfStale(await getDaemonRegistryRecord(String(req.params.daemonId)));
  if (!daemon || !daemon.online) return res.status(404).json({ error: 'Daemon not found' });
  let accessState;
  try {
    accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load daemon access state' });
  }
  res.json({
    daemonId: daemon.daemonId,
    workspaces: daemon.workspaces || [],
    hasMemberAccess: canMemberDaemonAccess(accessState, user.login),
    hasAdminAccess: canAdminDaemonAccess(accessState, user.login),
    canRead: canMemberDaemonAccess(accessState, user.login),
    canWrite: canAdminDaemonAccess(accessState, user.login),
  });
});

app.get('/api/daemons/:daemonId/directories', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemon = markDaemonOfflineIfStale(await getDaemonRegistryRecord(String(req.params.daemonId)));
  if (!daemon || !daemon.online) return res.status(404).json({ error: 'Daemon not found' });
  let accessState;
  try {
    accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load daemon access state' });
  }
  if (!canAdminDaemonAccess(accessState, user.login)) return res.status(403).json({ error: 'You are not allowed to use this daemon' });
  try {
    const result = await requestWorkspaceListing(daemon.daemonId, user.login, String(req.query.path || ''), String(req.query.query || ''));
    res.json(result);
  } catch (error) {
    res.status(504).json({ error: error.message || 'Directory lookup timed out' });
  }
});

app.get('/api/delegation-targets', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sourceSessionId = String(req.query.sourceSessionId || '').trim();
  const daemonRegistryRecords = (await listDaemonRegistryRecords()).map((daemon) => markDaemonOfflineIfStale(daemon));
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    if (!daemon) continue;
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, { daemon, accessState });
  }

  await ensureSessionIndicesReady();

  if (sourceSessionId) {
    const sourceSessionRecord = getIndexedSessionRecord(sourceSessionId);
    if (!sourceSessionRecord) return res.status(404).json({ error: 'Source session not found' });
    const sourceDaemonEntry = daemonAccessById.get(sourceSessionRecord.daemonId);
    if (!sourceDaemonEntry?.daemon) return res.status(404).json({ error: 'Source daemon not found' });
    const sourceAccessLevel = getSessionAccessLevelFromIndex({
      state: sessionIndexState,
      sessionRecord: sourceSessionRecord,
      daemonAccessState: sourceDaemonEntry.accessState,
      userId: user.login,
      canAdminDaemonAccess,
    });
    if (sourceAccessLevel !== 'write') {
      return res.status(403).json({ error: 'You do not have write access to the source session' });
    }
  }

  const targets = buildSessionListForUser({
    state: sessionIndexState,
    daemonAccessById,
    userId: user.login,
    canAdminDaemonAccess,
    canMemberDaemonAccess,
  })
    .filter((session) => session.canWrite && session.sessionId !== sourceSessionId)
    .map((session) => ({
      sessionId: session.sessionId,
      roomName: session.roomName,
      daemonId: session.daemonId,
      daemonLabel: daemonAccessById.get(session.daemonId)?.daemon?.hostname || session.daemonId,
      agentName: session.agentName,
      workingDirectory: session.workingDirectory,
      ownerUserId: session.ownerUserId,
      updatedAt: session.updatedAt,
      targetLabel: delegationTargetLabel(session, daemonAccessById.get(session.daemonId)?.daemon),
    }));

  res.json({ targets });
});

app.post('/api/delegations', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;

  const sourceSessionId = String(req.body?.sourceSessionId || '').trim();
  const targetSessionId = String(req.body?.targetSessionId || '').trim();
  const prompt = String(req.body?.prompt || '').trim();
  const displayText = String(req.body?.displayText || '').trim();

  if (!sourceSessionId) return res.status(400).json({ error: 'sourceSessionId is required' });
  if (!targetSessionId) return res.status(400).json({ error: 'targetSessionId is required' });
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (sourceSessionId === targetSessionId) return res.status(400).json({ error: 'sourceSessionId and targetSessionId must differ' });

  await ensureSessionIndicesReady();

  const sourceSessionRecord = getIndexedSessionRecord(sourceSessionId);
  const targetSessionRecord = getIndexedSessionRecord(targetSessionId);
  if (!sourceSessionRecord) return res.status(404).json({ error: 'Source session not found' });
  if (!targetSessionRecord) return res.status(404).json({ error: 'Target session not found' });

  const [sourceDaemon, targetDaemon] = await Promise.all([
    getDaemonRegistryRecord(sourceSessionRecord.daemonId),
    getDaemonRegistryRecord(targetSessionRecord.daemonId),
  ]);
  if (!sourceDaemon) return res.status(404).json({ error: 'Source daemon not found' });
  if (!targetDaemon || !markDaemonOfflineIfStale(targetDaemon).online) {
    return res.status(404).json({ error: 'Target daemon not found or offline' });
  }

  const sourceDaemonAccessState = sourceDaemon.accessState || await ensureDaemonAclState(sourceDaemon.daemonId, '', sourceDaemon);
  const targetDaemonAccessState = targetDaemon.accessState || await ensureDaemonAclState(targetDaemon.daemonId, '', targetDaemon);
  const sourceAccessLevel = getSessionAccessLevelFromIndex({
    state: sessionIndexState,
    sessionRecord: sourceSessionRecord,
    daemonAccessState: sourceDaemonAccessState,
    userId: user.login,
    canAdminDaemonAccess,
  });
  const targetAccessLevel = getSessionAccessLevelFromIndex({
    state: sessionIndexState,
    sessionRecord: targetSessionRecord,
    daemonAccessState: targetDaemonAccessState,
    userId: user.login,
    canAdminDaemonAccess,
  });

  if (sourceAccessLevel !== 'write') {
    return res.status(403).json({ error: 'You do not have write access to the source session' });
  }
  if (targetAccessLevel !== 'write') {
    return res.status(403).json({ error: 'You do not have write access to the target session' });
  }

  const delegationId = crypto.randomUUID();
  const relayRoomId = buildDelegationRelayRoomId(delegationId);
  const createdAt = new Date().toISOString();
  const targetLabel = delegationTargetLabel(targetSessionRecord, targetDaemon);
  const responsePayload = {
    delegationId,
    relayRoomId,
    relayResumeFromSeq: 0,
    sourceSessionId,
    targetSessionId,
    targetLabel,
    target: {
      sessionId: targetSessionRecord.sessionId,
      daemonId: targetSessionRecord.daemonId,
      sessionLabel: targetSessionRecord.roomName,
      workspaceLabel: targetDaemon.hostname || targetSessionRecord.daemonId,
    },
  };

  try {
    await ensureChatRoomWithMembers(relayRoomId, `Delegation Relay ${delegationId.slice(0, 8)}`, [
      { userId: ADMIN_USER_ID, role: 'room.operator' },
      { userId: user.login, role: 'room.member' },
      { userId: targetSessionRecord.daemonId, role: 'room.member' },
    ]);
    await ensureDelegationControlRoom(targetSessionRecord.daemonId);

    await appendDelegationControlEvent({
      type: 'control.delegation.created',
      delegationId,
      sourceSessionId,
      targetSessionId,
      relayRoomId,
      requesterUserId: user.login,
      targetDaemonId: targetSessionRecord.daemonId,
      createdAt,
      data: {
        prompt,
        displayText,
        targetLabel,
      },
    });

    await appendDelegationSummaryEvent(sourceSessionId, {
      type: 'delegation.prompt',
      delegationId,
      relayRoomId,
      sourceSessionId,
      targetSessionId,
      targetLabel,
      message: prompt,
      createdAt,
    });

    res.json(responsePayload);
    void syncDelegatingSessionState(sourceSessionRecord);

    const targetControlEnvelope = buildDelegationTargetControlEnvelope({
      type: 'control.delegation.request',
      delegationId,
      sourceSessionId,
      targetSessionId,
      relayRoomId,
      requesterUserId: user.login,
      targetDaemonId: targetSessionRecord.daemonId,
      createdAt,
      prompt,
      displayText,
      resumeFromSeq: 0,
    });

    void (async () => {
      try {
        await adminSendToRoom(targetSessionId, JSON.stringify(targetControlEnvelope), 'delegation.request');

        await appendDelegationControlEvent({
          type: 'control.delegation.dispatched',
          delegationId,
          sourceSessionId,
          targetSessionId,
          relayRoomId,
          requesterUserId: user.login,
          targetDaemonId: targetSessionRecord.daemonId,
          createdAt: new Date().toISOString(),
          data: {
            prompt,
            displayText,
            targetLabel,
          },
        });

        await appendDelegationSummaryEvent(sourceSessionId, {
          type: 'delegation.dispatched',
          delegationId,
          relayRoomId,
          sourceSessionId,
          targetSessionId,
          targetLabel,
          message: displayText || prompt,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        try {
          await appendDelegationControlEvent({
            type: 'control.delegation.failed',
            delegationId,
            sourceSessionId,
            targetSessionId,
            relayRoomId,
            requesterUserId: user.login,
            targetDaemonId: targetSessionRecord.daemonId,
            createdAt: new Date().toISOString(),
            data: {
              status: 'failed',
              error: error.message || 'Failed to dispatch delegation',
              targetLabel,
            },
          });
          await appendDelegationSummaryEvent(sourceSessionId, {
            type: 'delegation.failed',
            delegationId,
            relayRoomId,
            sourceSessionId,
            targetSessionId,
            targetLabel,
            message: error.message || 'Failed to dispatch delegation',
            createdAt: new Date().toISOString(),
          });
        } catch {}

        void syncDelegatingSessionState(sourceSessionRecord);

        console.error('[Web] Failed to dispatch delegation:', error);
      }
    })();
  } catch (error) {
    try {
      await appendDelegationControlEvent({
        type: 'control.delegation.failed',
        delegationId,
        sourceSessionId,
        targetSessionId,
        relayRoomId,
        requesterUserId: user.login,
        targetDaemonId: targetSessionRecord.daemonId,
        createdAt: new Date().toISOString(),
        data: {
          status: 'failed',
          error: error.message || 'Failed to create delegation',
          targetLabel,
        },
      });
      await appendDelegationSummaryEvent(sourceSessionId, {
        type: 'delegation.failed',
        delegationId,
        relayRoomId,
        sourceSessionId,
        targetSessionId,
        targetLabel,
        message: error.message || 'Failed to create delegation',
        createdAt: new Date().toISOString(),
      });
    } catch {}

    void syncDelegatingSessionState(sourceSessionRecord);

    console.error('[Web] Failed to create delegation:', error);
    res.status(500).json({ error: error.message || 'Failed to create delegation' });
  }
});

app.post('/api/delegations/:delegationId/cancel', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;

  const delegationId = String(req.params.delegationId || '').trim();
  if (!delegationId) return res.status(400).json({ error: 'delegationId is required' });

  const record = await readDelegationRecord(delegationId);
  if (!record) return res.status(404).json({ error: 'Delegation not found' });

  await ensureSessionIndicesReady();
  const sourceSessionRecord = getIndexedSessionRecord(record.sourceSessionId);
  if (!sourceSessionRecord) return res.status(404).json({ error: 'Source session not found' });
  const sourceDaemon = await getDaemonRegistryRecord(sourceSessionRecord.daemonId);
  if (!sourceDaemon) return res.status(404).json({ error: 'Source daemon not found' });
  const sourceDaemonAccessState = sourceDaemon.accessState || await ensureDaemonAclState(sourceDaemon.daemonId, '', sourceDaemon);
  const sourceAccessLevel = getSessionAccessLevelFromIndex({
    state: sessionIndexState,
    sessionRecord: sourceSessionRecord,
    daemonAccessState: sourceDaemonAccessState,
    userId: user.login,
    canAdminDaemonAccess,
  });
  if (sourceAccessLevel !== 'write') {
    return res.status(403).json({ error: 'You do not have write access to the source session' });
  }

  const currentStatus = record.terminalStatus || record.status;
  if (isDelegationTerminalStatus(currentStatus)) {
    return res.json({ ok: true, status: currentStatus, terminal: true });
  }

  if (record.cancelRequestedAt) {
    return res.json({ ok: true, status: 'cancel_requested' });
  }

  const createdAt = new Date().toISOString();
  await appendDelegationControlEvent({
    type: 'control.delegation.cancel_requested',
    delegationId,
    sourceSessionId: record.sourceSessionId,
    targetSessionId: record.targetSessionId,
    relayRoomId: record.relayRoomId,
    requesterUserId: record.requesterUserId,
    targetDaemonId: record.targetDaemonId,
    createdAt,
    data: {
      targetLabel: record.targetLabel,
    },
  });

  const cancelEnvelope = buildDelegationTargetControlEnvelope({
    type: 'control.delegation.cancel',
    delegationId,
    sourceSessionId: record.sourceSessionId,
    targetSessionId: record.targetSessionId,
    relayRoomId: record.relayRoomId,
    requesterUserId: record.requesterUserId,
    targetDaemonId: record.targetDaemonId,
    createdAt,
  });
  await adminSendToRoom(record.targetSessionId, JSON.stringify(cancelEnvelope), 'delegation.cancel');

  res.json({ ok: true, status: 'cancel_requested' });
});

app.post('/api/delegations/:delegationId/settle', async (req, res) => {
  const verification = parseDaemonSessionToken(req);
  if (!verification.ok) return res.status(403).json({ error: verification.error });

  const delegationId = String(req.params.delegationId || '').trim();
  const status = String(req.body?.status || '').trim();
  const errorMessage = String(req.body?.errorMessage || '').trim();
  if (!delegationId) return res.status(400).json({ error: 'delegationId is required' });
  if (!isDelegationTerminalStatus(status) || status === 'expired') {
    return res.status(400).json({ error: 'status must be completed, failed, or cancelled' });
  }

  const record = await readDelegationRecord(delegationId);
  if (!record) return res.status(404).json({ error: 'Delegation not found' });
  if (record.targetDaemonId !== verification.daemonId) {
    return res.status(403).json({ error: 'Daemon is not allowed to settle this delegation' });
  }

  const currentTerminalStatus = record.terminalStatus || (isDelegationTerminalStatus(record.status) ? record.status : '');
  if (currentTerminalStatus) {
    if (currentTerminalStatus === status) {
      return res.json({ ok: true, status, duplicate: true });
    }
    return res.status(409).json({ error: `Delegation already settled as ${currentTerminalStatus}` });
  }

  const controlType = controlTypeForTerminalStatus(status);
  const summaryType = summaryTypeForTerminalStatus(status);
  const createdAt = new Date().toISOString();
  const summary = req.body?.summary && typeof req.body.summary === 'object'
    ? {
      finalContent: req.body.summary.finalContent == null ? undefined : String(req.body.summary.finalContent),
      model: req.body.summary.model == null ? undefined : String(req.body.summary.model),
      usage: req.body.summary.usage,
    }
    : undefined;

  await appendDelegationControlEvent({
    type: controlType,
    delegationId,
    sourceSessionId: record.sourceSessionId,
    targetSessionId: record.targetSessionId,
    relayRoomId: record.relayRoomId,
    requesterUserId: record.requesterUserId,
    targetDaemonId: record.targetDaemonId,
    createdAt,
    data: {
      status,
      targetLabel: record.targetLabel,
      summary,
      error: errorMessage,
    },
  });

  await appendDelegationSummaryEvent(record.sourceSessionId, {
    type: summaryType,
    delegationId,
    relayRoomId: record.relayRoomId,
    sourceSessionId: record.sourceSessionId,
    targetSessionId: record.targetSessionId,
    targetLabel: record.targetLabel,
    message: errorMessage,
    summary,
    createdAt,
  });

  const sourceSessionRecord = getIndexedSessionRecord(record.sourceSessionId);
  if (sourceSessionRecord) {
    void syncDelegatingSessionState(sourceSessionRecord);
  }

  res.json({ ok: true, status });
});

app.get('/api/sessions', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonFilter = String(req.query.daemonId || '').trim();
  const agentFilter = String(req.query.agentName || '').trim();
  const daemonRegistryRecords = (await listDaemonRegistryRecords()).map((daemon) => markDaemonOfflineIfStale(daemon));
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    if (!daemon) continue;
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, { daemon, accessState });
  }
  if (daemonFilter) {
    const daemonEntry = daemonAccessById.get(daemonFilter);
    if (!daemonEntry?.daemon || !daemonEntry.daemon.online) return res.status(404).json({ error: 'Daemon not found' });
    if (!canMemberDaemonAccess(daemonEntry.accessState, user.login)) {
      return res.json({ sessions: [], blockedReason: 'daemon-access-denied' });
    }
  }
  await ensureSessionIndicesReady();
  const delegatingSourceSessionIds = collectDelegatingSourceSessionIds(reduceDelegationControlEvents(await listDelegationControlEvents()));
  res.json({
    sessions: buildSessionListForUser({
      state: sessionIndexState,
      daemonAccessById,
      userId: user.login,
      daemonFilter,
      agentFilter,
      activeDelegationSourceSessionIds: delegatingSourceSessionIds,
      canAdminDaemonAccess,
      canMemberDaemonAccess,
    }),
  });
});

app.post('/api/sessions', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonId = String(req.body.daemonId || '').trim();
  const agentName = String(req.body.agentName || '').trim();
  const workingDirectory = String(req.body.workingDirectory || '').trim();
  const roomName = String(req.body.roomName || '').trim() || 'Session';
  const daemon = markDaemonOfflineIfStale(await getDaemonRegistryRecord(daemonId));
  if (!daemon || !daemon.online) return res.status(404).json({ error: 'Daemon not found' });
  let accessState;
  try {
    accessState = await ensureDaemonAclState(daemon.daemonId, '', daemon);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load daemon access state' });
  }
  if (!canAdminDaemonAccess(accessState, user.login)) return res.status(403).json({ error: 'You are not allowed to use this daemon' });
  if (!agentName) return res.status(400).json({ error: 'agentName is required' });
  try {
    const sessionRecord = await createManagedSession({
      ownerUserId: user.login,
      daemonId,
      agentName,
      workingDirectory,
      roomName,
    });
    upsertTrustedSessionDirectoryRecord(sessionIndexState, sessionRecord, { source: 'portal' });
    upsertTrustedSessionMembership(sessionIndexState, sessionRecord.sessionId, user.login, 'write', { source: 'portal' });
    res.json({
      sessionId: sessionRecord.sessionId,
      roomName: sessionRecord.roomName,
      daemonId: sessionRecord.daemonId,
      agentName: sessionRecord.agentName,
      workingDirectory: sessionRecord.workingDirectory,
      ownerUserId: sessionRecord.ownerUserId,
      updatedAt: sessionRecord.updatedAt,
      accessLevel: 'write',
      canRead: true,
      canWrite: true,
      joined: true,
    });
  } catch (error) {
    console.error('[Web] Failed to create managed session:', error);
    res.status(500).json({ error: error.message || 'Failed to create session' });
  }
});

app.get('/api/join-requests', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const daemonRegistryRecords = (await listDaemonRegistryRecords()).map((daemon) => markDaemonOfflineIfStale(daemon));
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    if (!daemon) continue;
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, accessState);
  }
  await ensureSessionIndicesReady();
  const joinRequests = [];
  for (const sessionRecord of sessionIndexState.directoryBySessionId.values()) {
    if (sessionRecord.deletedAt) continue;
    if (!sessionRecord || !canManageSession(sessionRecord, daemonAccessById.get(sessionRecord.daemonId), user.login)) continue;
    const requests = listJoinRequestsForSession(sessionIndexState, sessionRecord.sessionId);
    for (const requestRecord of requests) {
      if (requestRecord.status !== 'pending') continue;
      joinRequests.push({
        ...requestRecord,
        sessionId: sessionRecord.sessionId,
      });
    }
  }
  joinRequests.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  res.json({ joinRequests });
});

app.post('/api/sessions/:sessionId/join-requests', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sessionId = String(req.params.sessionId || '').trim();
  await ensureSessionIndicesReady();
  const sessionRecord = getIndexedSessionRecord(sessionId);
  if (!sessionRecord) return res.status(404).json({ error: 'Session not found' });
  const daemon = await getDaemonRegistryRecord(sessionRecord.daemonId);
  if (!daemon) return res.status(404).json({ error: 'Daemon not found' });
  const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  if (!canMemberDaemonAccess(accessState, user.login)) {
    return res.status(403).json({ error: 'You need daemon access before requesting session access' });
  }
  const existingAccessLevel = getSessionAccessLevelFromIndex({
    state: sessionIndexState,
    sessionRecord,
    daemonAccessState: accessState,
    userId: user.login,
    canAdminDaemonAccess,
  });
  const rawRequestedAccess = String(req.body?.requestedAccess || '').trim().toLowerCase();
  const requestedAccess = rawRequestedAccess || 'read';
  if (requestedAccess !== 'read' && requestedAccess !== 'write') {
    return res.status(400).json({ error: 'requestedAccess must be read or write' });
  }
  if (existingAccessLevel === 'write' || (existingAccessLevel === 'read' && requestedAccess === 'read')) {
    return res.json({ ok: true, status: 'approved', joined: true, requestId: '', requestedAccess });
  }
  const existing = getLatestJoinRequestForUser(sessionIndexState, sessionId, user.login);
  if (existing?.status === 'pending' && existing.requestedAccess === requestedAccess) {
    return res.json({ ok: true, status: 'pending', requestId: existing.requestId, joined: false, requestedAccess });
  }
  const requestId = crypto.randomUUID();
  const requestRecord = {
    requestId,
    sessionId,
    requesterUserId: user.login,
    ownerUserId: sessionRecord.ownerUserId,
    daemonId: sessionRecord.daemonId,
    agentName: sessionRecord.agentName,
    workingDirectory: sessionRecord.workingDirectory,
    roomName: sessionRecord.roomName,
    requestedAccess,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await appendJoinRequestEvent(sessionRecord, requestRecord);
  upsertTrustedJoinRequestState(sessionIndexState, sessionId, requestRecord, { source: 'portal' });
  res.json({ ok: true, status: 'pending', requestId, joined: false, requestedAccess });
});

app.post('/api/sessions/:sessionId/join-requests/:requestId/approve', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sessionId = String(req.params.sessionId || '').trim();
  const requestId = String(req.params.requestId || '').trim();
  const daemonRegistryRecords = await listDaemonRegistryRecords();
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, accessState);
  }
  await ensureSessionIndicesReady();
  const sessionRecord = getIndexedSessionRecord(sessionId);
  if (!sessionRecord) return res.status(404).json({ error: 'Session not found' });
  const joinRequest = findJoinRequestById(sessionIndexState, sessionId, requestId);
  if (!joinRequest) return res.status(404).json({ error: 'Join request not found' });
  const daemonAccessState = daemonAccessById.get(sessionRecord.daemonId);
  if (!canManageSession(sessionRecord, daemonAccessState, user.login)) {
    return res.status(403).json({ error: 'Only a session manager can approve join requests' });
  }
  try {
    await upsertChatRoomMember(sessionId, joinRequest.requesterUserId, joinRequest.requestedAccess === 'write' ? 'room.operator' : 'room.member');
    const approvedJoinRequest = {
      ...joinRequest,
      sessionId,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };
    await appendJoinRequestEvent(sessionRecord, approvedJoinRequest);
    upsertTrustedSessionMembership(
      sessionIndexState,
      sessionId,
      joinRequest.requesterUserId,
      joinRequest.requestedAccess === 'write' ? 'write' : 'read',
      { source: 'portal' },
    );
    upsertTrustedJoinRequestState(sessionIndexState, sessionId, approvedJoinRequest, { source: 'portal' });
    // Notify the requester in the lobby for immediate UI update
    try {
      await sendLobbyEnvelope({
        type: 'portal.access-approved',
        target: 'session',
        sessionId,
        requestId,
        daemonId: sessionRecord.daemonId,
        agentName: sessionRecord.agentName,
        requesterUserId: joinRequest.requesterUserId,
        requestedAccess: joinRequest.requestedAccess || 'read',
        status: 'approved',
      });
    } catch (lobbyErr) { console.warn('[Web] Lobby notify failed:', lobbyErr?.message); }
    res.json({ ok: true, status: 'approved', requestedAccess: joinRequest.requestedAccess || 'read' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to approve join request' });
  }
});

app.post('/api/sessions/:sessionId/join-requests/:requestId/reject', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sessionId = String(req.params.sessionId || '').trim();
  const requestId = String(req.params.requestId || '').trim();
  const daemonRegistryRecords = await listDaemonRegistryRecords();
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, accessState);
  }
  await ensureSessionIndicesReady();
  const sessionRecord = getIndexedSessionRecord(sessionId);
  if (!sessionRecord) return res.status(404).json({ error: 'Session not found' });
  const joinRequest = findJoinRequestById(sessionIndexState, sessionId, requestId);
  if (!joinRequest) return res.status(404).json({ error: 'Join request not found' });
  const daemonAccessState = daemonAccessById.get(sessionRecord.daemonId);
  if (!canManageSession(sessionRecord, daemonAccessState, user.login)) {
    return res.status(403).json({ error: 'Only a session manager can reject join requests' });
  }
  const rejectedJoinRequest = {
    ...joinRequest,
    sessionId,
    status: 'denied',
    updatedAt: new Date().toISOString(),
  };
  await appendJoinRequestEvent(sessionRecord, rejectedJoinRequest);
  upsertTrustedJoinRequestState(sessionIndexState, sessionId, rejectedJoinRequest, { source: 'portal' });
  try {
    await sendLobbyEnvelope({
      type: 'portal.access-denied',
      target: 'session',
      sessionId,
      requestId,
      daemonId: sessionRecord.daemonId,
      agentName: sessionRecord.agentName,
      requesterUserId: joinRequest.requesterUserId,
      requestedAccess: joinRequest.requestedAccess || 'read',
      status: 'denied',
    });
  } catch (lobbyErr) { console.warn('[Web] Lobby notify failed:', lobbyErr?.message); }
  res.json({ ok: true, status: 'denied', requestedAccess: joinRequest.requestedAccess || 'read' });
});

app.post('/api/sessions/:sessionId/access-self', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sessionId = String(req.params.sessionId || '').trim();
  await ensureSessionIndicesReady();
  const sessionRecord = getIndexedSessionRecord(sessionId);
  if (!sessionRecord) return res.status(404).json({ error: 'Session not found' });
  const daemon = await getDaemonRegistryRecord(sessionRecord.daemonId);
  if (!daemon) return res.status(404).json({ error: 'Daemon not found' });
  const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
  const accessLevel = getSessionAccessLevelFromIndex({
    state: sessionIndexState,
    sessionRecord,
    daemonAccessState: accessState,
    userId: user.login,
    canAdminDaemonAccess,
  });
  if (accessLevel === 'none') {
    return res.status(403).json({ error: 'You do not have access to this session' });
  }
  const desiredAccessLevel = accessLevel === 'write' ? 'write' : 'read';
  const desiredRole = desiredAccessLevel === 'write' ? 'room.operator' : 'room.member';
  await upsertChatRoomMember(sessionId, user.login, desiredRole);
  upsertTrustedSessionMembership(sessionIndexState, sessionId, user.login, desiredAccessLevel, { source: 'portal' });
  res.json({ ok: true, accessLevel: desiredAccessLevel, joined: true });
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sessionId = String(req.params.sessionId || '').trim();
  const daemonRegistryRecords = await listDaemonRegistryRecords();
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, accessState);
  }
  await ensureSessionIndicesReady();
  const sessionRecord = getIndexedSessionRecord(sessionId);
  if (!sessionRecord) return res.status(404).json({ error: 'Session not found' });
  const daemonAccessState = daemonAccessById.get(sessionRecord.daemonId);
  if (!canManageSession(sessionRecord, daemonAccessState, user.login)) {
    return res.status(403).json({ error: 'Only a session manager can delete a session' });
  }
  try {
    await deleteManagedSession(sessionRecord);
    markTrustedSessionDeleted(sessionIndexState, sessionId, new Date().toISOString(), { source: 'portal' });
    await sendDaemonSyncEnvelope(sessionRecord, 'session.deleted');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete session' });
  }
});

app.delete('/api/sessions/:sessionId/members/:userId', async (req, res) => {
  const user = requirePortalUser(req, res);
  if (!user) return;
  const sessionId = String(req.params.sessionId || '').trim();
  const targetUserId = String(req.params.userId || '').trim();
  const daemonRegistryRecords = await listDaemonRegistryRecords();
  const daemonAccessById = new Map();
  for (const daemon of daemonRegistryRecords) {
    const accessState = daemon.accessState || await ensureDaemonAclState(daemon.daemonId, '', daemon);
    daemonAccessById.set(daemon.daemonId, accessState);
  }
  await ensureSessionIndicesReady();
  const sessionRecord = getIndexedSessionRecord(sessionId);
  if (!sessionRecord) return res.status(404).json({ error: 'Session not found' });
  const daemonAccessState = daemonAccessById.get(sessionRecord.daemonId);
  if (targetUserId !== user.login && !canManageSession(sessionRecord, daemonAccessState, user.login)) {
    return res.status(403).json({ error: 'Only a session manager can remove another member' });
  }
  if (targetUserId === sessionRecord.ownerUserId) {
    return res.status(400).json({ error: 'Use DELETE /api/sessions/:sessionId to delete an owned session' });
  }
  try {
    await invokeAdminChat('removeSessionMember', (chat) => chat.removeUserFromRoom(sessionId, targetUserId));
    removeTrustedSessionMembership(sessionIndexState, sessionId, targetUserId, { source: 'portal' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to remove session member' });
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Web] Uncaught exception:', err.message);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[Web] Unhandled rejection:', err);
});

const server = app.listen(port, async () => {
  console.log(`[Web] Ready at http://localhost:${port}`);
  console.log(`[Web] GitHub OAuth: ${OAUTH_ENABLED ? 'enabled' : DISABLE_OAUTH ? 'disabled by --disable-oauth' : 'disabled (set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in .env to enable)'}`);
  try {
    await initAdminChat();
    warmSessionIndexInBackground('startup');
  } catch (e) {
    console.error('[Web] Admin chat init failed:', e.message);
  }
  console.log(`[Web] Run 'npm run daemon' to start the agent daemon.`);
});
server.on('error', (err) => {
  console.error('[Web] Server error:', err.message);
  process.exit(1);
});

export async function shutdownWebServer() {
  adminShuttingDown = true;
  if (adminReconnectTimer) {
    clearTimeout(adminReconnectTimer);
    adminReconnectTimer = null;
  }
  if (adminChatInitPromise) {
    try { await adminChatInitPromise; } catch {}
  }
  if (adminChat) {
    await stopChatClient(adminChat);
    adminChat = null;
  }
  const serverClosePromise = new Promise((resolveClose) => server.close(() => resolveClose()));
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  await serverClosePromise;
}

export { app, server };

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    process.exit(signal === 'SIGINT' ? 130 : 0);
  });
}
