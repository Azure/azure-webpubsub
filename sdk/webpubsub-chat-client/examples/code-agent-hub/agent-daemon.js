/**
 * Agent Daemon — runs on the user's machine.
 *
 * Responsibilities:
 * - Chat Bot: logs into Web PubSub Chat, listens for user messages
 * - ACP Agent: spawns code agents (Copilot, Claude, Codex)
 * - Session Manager: creates sessions, maps events to Chat
 * - File System: reads/writes files on the local machine
 * - Terminal: executes commands on the local machine
 * - Permission: forwards permission requests to Chat, waits for user response
 *
 * The web-server.js only provides static files and /negotiate.
 * All agent logic lives here.
 */

import { createHmac, randomUUID } from 'crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, resolve, delimiter, relative, isAbsolute } from 'path';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { ChatClient } from '@azure/web-pubsub-chat-client';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { hostname as osHostname } from 'os';
import { createModelsUpdateEvent, hasModelToolbarState } from './public/session-toolbar-state.js';

// ── Configuration ──

const INSTALL_ALL_AGENT_CLI_MODE = process.argv.includes('--install-all-agent-cli');
const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING || process.env.WebPubSubConnectionString;
if (!INSTALL_ALL_AGENT_CLI_MODE && !connectionString) {
  console.error('[Daemon] Error: WEB_PUBSUB_CONNECTION_STRING or WebPubSubConnectionString is required');
  process.exit(1);
}

const hubName = process.env.WEB_PUBSUB_HUB || 'chat';
const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
const BOT_USER_ID = process.env.DAEMON_USER_ID || 'copilot-bot';
const BOT_OWNER_USER_ID = process.env.DAEMON_OWNER_USER_ID || process.env.DAEMON_OWNER || process.env.USERNAME || process.env.USER || 'local-owner';
const PORTAL_CONTROL_USER_ID = process.env.PORTAL_CONTROL_USER_ID || '__portal_control__';
const MAX_ROOM_MESSAGE_LENGTH = 4096;
const LOBBY_ROOM = 'lobby';
const DAEMON_CONTROL_ROOM = BOT_USER_ID;
const DAEMON_HEARTBEAT_MS = 30000;
const DAEMON_DIR = process.argv[1]
  ? dirname(resolve(process.argv[1]))
  : process.cwd();
const PROJECT_ROOT = resolve(DAEMON_DIR, '..', '..');
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH
  || resolve(process.env.HOME || process.env.USERPROFILE || '.', '.copilot-mobile', 'sessions.json');
const DEFAULT_SDK_MODEL = 'gpt-5.4';
const SESSION_STORE_DEBOUNCE_MS = 150;
const ACP_IDLE_GRACE_MS = 180;
const ACP_STARTUP_TIMEOUT_MS = Number(process.env.ACP_STARTUP_TIMEOUT_MS || 90000);
const WORKSPACE_LIST_LIMIT = 200;
const SUPPORTED_ACP_AGENT_NAMES = ['copilot', 'claude', 'codex'];

function parseConnectionStringValue(key) {
  const part = connectionString
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.toLowerCase().startsWith(`${key.toLowerCase()}=`));
  return part ? part.slice(key.length + 1) : '';
}

const portalSigningKey = Buffer.from(parseConnectionStringValue('AccessKey') || '', 'base64');

function isPortalControlUser(userId) {
  return String(userId || '').trim() === PORTAL_CONTROL_USER_ID;
}

function signDaemonRequest(timestamp) {
  return createHmac('sha256', portalSigningKey)
    .update(`${BOT_USER_ID}\n${BOT_OWNER_USER_ID}\n${timestamp}`)
    .digest('hex');
}

function buildDaemonPortalPayload(details = {}) {
  const timestamp = new Date().toISOString();
  return {
    daemonId: BOT_USER_ID,
    ownerUserId: BOT_OWNER_USER_ID,
    hostname: details.hostname,
    platform: details.platform,
    agents: details.agents,
    workspaces: details.workspaces,
    timestamp,
    signature: signDaemonRequest(timestamp),
  };
}

async function postDaemonPortal(path, details = {}) {
  const endpoint = `${portalUrl}${path}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDaemonPortalPayload(details)),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.error || `Portal request failed (${resp.status})`);
  }
  return body;
}

// ── ACP Agent Configs ──

const ACP_AGENTS = {
  'copilot': {
    command: 'npx',
    args: ['@github/copilot@latest', '--acp'],
    npxPackage: '@github/copilot@latest',
    npxArgs: ['--acp'],
    binName: 'copilot',
    binArgs: ['--acp'],
    displayName: 'GitHub Copilot',
  },
  'claude': {
    command: 'npx',
    args: ['@agentclientprotocol/claude-agent-acp@latest'],
    npxPackage: '@agentclientprotocol/claude-agent-acp@latest',
    npxArgs: [],
    binName: 'claude-agent-acp',
    binArgs: [],
    displayName: 'Claude Code',
  },
  'codex': {
    command: 'npx',
    args: ['@zed-industries/codex-acp@latest'],
    npxPackage: '@zed-industries/codex-acp@latest',
    npxArgs: [],
    binName: 'codex-acp',
    binArgs: [],
    displayName: 'Codex CLI',
  },
};

async function runCommandOrThrow(command, args = []) {
  const launch = resolveSpawnLaunch(command, args);
  const child = spawn(launch.command, launch.args, { stdio: 'inherit', shell: false });
  const [code, signal] = await once(child, 'close');
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${code}${signal ? ` (signal=${signal})` : ''}`.trim());
  }
}

function quoteWindowsCommandArg(value) {
  const text = String(value ?? '');
  if (!text) return '""';
  if (!/[\s"]/.test(text)) return text;
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function resolveSpawnLaunch(command, args = []) {
  if (process.platform !== 'win32') {
    return { command, args };
  }

  const text = String(command || '');
  const needsCmd = text === 'npm'
    || text === 'npx'
    || /\.(cmd|bat)$/i.test(text);

  if (!needsCmd) {
    return { command, args };
  }

  const commandLine = [quoteWindowsCommandArg(text), ...args.map(quoteWindowsCommandArg)].join(' ');
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
  };
}

async function installAllSupportedAgentCli() {
  for (const agentName of SUPPORTED_ACP_AGENT_NAMES) {
    const config = ACP_AGENTS[agentName];
    if (!config?.npxPackage) continue;
    console.log(`[Daemon] Installing ${agentName} CLI: ${config.npxPackage}`);
    await runCommandOrThrow('npm', ['install', '-g', config.npxPackage]);
  }
  console.log('[Daemon] All supported ACP agent CLIs are installed.');
}

// ── State ──

async function loadSessionStore() {
  try {
    return JSON.parse(await readFile(SESSION_STORE_PATH, 'utf-8'));
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[Daemon] Failed to load session store:', err.message);
    }
  }
  return {};
}

let sessionStoreDirty = false;
let sessionStoreSaveTimer = null;
let sessionStoreSavePromise = Promise.resolve();

async function writeSessionStoreToDisk(store) {
  if (!sessionStoreDirty) return;
  sessionStoreDirty = false;
  try {
    await mkdir(dirname(SESSION_STORE_PATH), { recursive: true });
    await writeFile(SESSION_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Daemon] Failed to save session store:', err.message);
  }
}

function scheduleSessionStoreWrite(store, immediate = false) {
  sessionStoreDirty = true;
  if (sessionStoreSaveTimer) {
    clearTimeout(sessionStoreSaveTimer);
    sessionStoreSaveTimer = null;
  }

  if (!immediate) {
    sessionStoreSaveTimer = setTimeout(() => {
      sessionStoreSaveTimer = null;
      sessionStoreSavePromise = sessionStoreSavePromise.then(
        () => writeSessionStoreToDisk(store),
        () => writeSessionStoreToDisk(store),
      );
    }, SESSION_STORE_DEBOUNCE_MS);
    sessionStoreSaveTimer.unref?.();
    return sessionStoreSavePromise;
  }

  sessionStoreSavePromise = sessionStoreSavePromise.then(
    () => writeSessionStoreToDisk(store),
    () => writeSessionStoreToDisk(store),
  );
  return sessionStoreSavePromise;
}

async function flushSessionStoreWrites(store) {
  await scheduleSessionStoreWrite(store, true);
}

const sessions = new Map();
const sessionStore = {};
const resumePromises = new Map();
let botChat = null;
let botChatInitPromise = null;
let botReconnectTimer = null;
let botReconnectAttempt = 0;
let heartbeatTimer = null;
let advertisedWorkspaces = [];
let daemonPresenceInfo = null;
let shuttingDown = false;
let copilotSdkClient = null; // shared CopilotClient instance for SDK mode

function createSessionState({ sessionId, agentName, firstPrompt = '', ownerUserId = null, workingDirectory = process.cwd(), model = 'default' }) {
  return {
    sessionId,
    agentName,
    firstPrompt,
    acpConnection: null,
    acpSessionId: null,
    acpProcess: null,
    _acpClient: null,
    copilotSession: null,
    ownerUserId,
    workingDirectory,
    model,
    active: false,
    isReady: false,
    isProcessing: false,
    isStopping: false,
    startupPromise: null,
    pendingCount: 0,
    acpAwaitingIdle: false,
    acpIdleTimer: null,
    acpLastActivityAt: 0,
    isResuming: false,
    availableModes: [],
    currentModeId: '',
    availableModels: [],
    currentModelId: '',
    availableCommands: [],
    usageSize: 0,
    usageUsed: 0,
    usageCost: null,
    pendingPermissions: new Map(),
    toolInvocations: new Map(),
  };
}

function isSessionOwner(state, userId) {
  return !!state && !!userId && (!state.ownerUserId || state.ownerUserId === userId);
}

function resolveSessionPath(basePath, targetPath = '.') {
  const root = resolve(basePath || process.cwd());
  const resolvedPath = resolve(root, String(targetPath || '.'));
  const rel = relative(root, resolvedPath);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return resolvedPath;
  throw new Error(`Access outside the session working directory is not allowed: ${targetPath}`);
}

function cleanupClientTerminals(client) {
  if (!client?._terminals) return;
  for (const terminal of client._terminals.values()) {
    try { terminal?.process?.kill('SIGTERM'); } catch {}
  }
  client._terminals.clear();
}

async function stopExistingSession(state) {
  if (!state) return;
  clearAcpIdleTimer(state);
  state.acpAwaitingIdle = false;
  cleanupClientTerminals(state._acpClient);
  if (state.acpProcess) {
    try { state.acpProcess.kill('SIGTERM'); } catch {}
  }
  if (state.copilotSession?.abort) {
    try { await state.copilotSession.abort(); } catch {}
  }
}

function spawnAcpChild(sessionId, agentName, launch) {
  const resolvedLaunch = resolveSpawnLaunch(launch.command, launch.args || []);
  const child = spawn(resolvedLaunch.command, resolvedLaunch.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(ACP_AGENTS[agentName]?.env || {}) },
    shell: false,
  });
  child.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[Daemon:${agentName}] ${line}`);
  });
  child.on('error', (err) => {
    console.error(`[Daemon:${agentName}] Failed to spawn:`, err.message);
    deactivateSession(sessionId, `Failed to start: ${err.message}`);
  });
  child.on('close', (code) => {
    console.log(`[Daemon:${agentName}] Exited (code=${code})`);
    deactivateSession(sessionId, `Agent exited (code=${code})`);
  });
  return child;
}

function persistSessionRecord(roomId, record) {
  sessionStore[roomId] = record;
  scheduleSessionStoreWrite(sessionStore);
}

function updateSessionRecord(roomId, patch) {
  if (!sessionStore[roomId]) return;
  sessionStore[roomId] = { ...sessionStore[roomId], ...patch };
  scheduleSessionStoreWrite(sessionStore);
}

function deleteSessionRecord(roomId) {
  if (!sessionStore[roomId]) return;
  delete sessionStore[roomId];
  scheduleSessionStoreWrite(sessionStore);
}

function normalizeSdkModels(models) {
  if (!Array.isArray(models)) return [];
  return models.map((model) => ({
    modelId: model.id,
    name: model.name || model.id,
    description: model.capabilities?.family || '',
  }));
}

function emitCommandsUpdate(sessionId, commands) {
  botSend(sessionId, {
    type: 'commands.update',
    commands: (commands || []).map((command) => ({
      name: command.name,
      description: command.description,
      hasInput: !!command.input,
    })),
  });
}

function emitModesUpdate(sessionId, state) {
  botSend(sessionId, {
    type: 'modes.update',
    modes: (state.availableModes || []).map((mode) => ({ id: mode.id, name: mode.name, description: mode.description })),
    currentModeId: state.currentModeId || '',
  });
}

function emitModelsUpdate(sessionId, state) {
  botSend(sessionId, createModelsUpdateEvent(state));
}

function emitUsageUpdate(sessionId, state) {
  botSend(sessionId, {
    type: 'usage.update',
    size: state.usageSize || 0,
    used: state.usageUsed || 0,
    cost: state.usageCost || null,
  });
}

function syncSessionUiState(sessionId, state) {
  if (!state) return;
  emitSessionState(sessionId);
  if ((state.availableCommands || []).length) emitCommandsUpdate(sessionId, state.availableCommands);
  if ((state.availableModes || []).length || state.currentModeId) emitModesUpdate(sessionId, state);
  if (hasModelToolbarState(state)) emitModelsUpdate(sessionId, state);
  if ((state.usageSize || 0) > 0 || (state.usageUsed || 0) > 0) emitUsageUpdate(sessionId, state);
}

function handleSessionCapabilities(state, roomId, response) {
  if (response?.modes) {
    state.availableModes = response.modes.availableModes || [];
    state.currentModeId = response.modes.currentModeId || '';
    emitModesUpdate(roomId, state);
  }

  if (response?.models) {
    state.availableModels = (response.models.availableModels || []).map((model) => ({
      modelId: model.modelId,
      name: model.name || model.modelId,
      description: model.description,
    }));
    state.currentModelId = response.models.currentModelId || '';
    emitModelsUpdate(roomId, state);
  }
}

async function ensureCopilotSdkClient() {
  if (!copilotSdkClient) {
    const { CopilotClient } = await import('@github/copilot-sdk');
    copilotSdkClient = new CopilotClient();
    await copilotSdkClient.start();
    console.log('[Daemon] Copilot SDK client started');
  }
  return copilotSdkClient;
}

async function refreshSdkModels(state) {
  try {
    const client = await ensureCopilotSdkClient();
    const models = await client.listModels();
    state.availableModels = normalizeSdkModels(models);
    if (!state.currentModelId) {
      state.currentModelId = state.model || state.availableModels[0]?.modelId || '';
    }
    if (hasModelToolbarState(state)) emitModelsUpdate(state.sessionId, state);
  } catch (err) {
    console.warn('[Daemon] Failed to list Copilot SDK models:', err.message);
  }
}

async function startSdkSession(roomId, state, { model, workingDirectory }) {
  const client = await ensureCopilotSdkClient();
  const selectedModel = model || DEFAULT_SDK_MODEL;
  const selectedWorkingDirectory = workingDirectory || process.cwd();
  const copilotSession = await client.createSession({
    sessionId: roomId,
    model: selectedModel,
    streaming: true,
    workingDirectory: selectedWorkingDirectory,
    onPermissionRequest: createSdkPermissionHandler(roomId),
  });
  state.copilotSession = copilotSession;
  state.copilotSessionId = copilotSession.sessionId;
  state.active = true;
  state.currentModelId = selectedModel;
  bindCopilotSdkEvents(state);
  await refreshSdkModels(state);
  persistSessionRecord(roomId, {
    agentName: 'copilot-sdk',
    copilotSessionId: copilotSession.sessionId,
    cwd: selectedWorkingDirectory,
    model: state.currentModelId || selectedModel,
    supportsResume: true,
  });
  return state;
}

// ── Chat Bot Send ──

async function botSend(roomId, envelope) {
  try {
    if (shuttingDown) return;
    const chat = await ensureBotChatReady();
    if (!chat) return;
    const payload = JSON.stringify(envelope);
    if (payload.length <= MAX_ROOM_MESSAGE_LENGTH) {
      await chat.sendToRoom(roomId, payload);
      return;
    }
    const chunkId = randomUUID();
    const parts = [];
    let cursor = 0;
    while (cursor < payload.length) {
      let end = Math.min(payload.length, cursor + 3000);
      let part = payload.slice(cursor, end);
      let chunk = { type: 'transport.chunk', chunkId, index: parts.length, total: 0, jsonPart: part };
      while (JSON.stringify(chunk).length > MAX_ROOM_MESSAGE_LENGTH && part.length > 1) { end -= 128; part = payload.slice(cursor, end); chunk.jsonPart = part; }
      parts.push(part);
      cursor = end;
    }
    for (let index = 0; index < parts.length; index++) {
      await chat.sendToRoom(roomId, JSON.stringify({ type: 'transport.chunk', chunkId, index, total: parts.length, jsonPart: parts[index] }));
    }
  } catch (err) {
    console.error(`[Daemon] Failed to send to room ${roomId}:`, err.message);
  }
}

async function ensureRoomMembership(chatClient, roomId, roomName, userId, extraUsers = []) {
  try {
    await chatClient.createRoom(roomName, [userId, ...extraUsers], roomId);
    return;
  } catch {}
  for (const memberId of [...new Set([userId, ...extraUsers].filter(Boolean))]) {
    try {
      await chatClient.addUserToRoom(roomId, memberId);
    } catch {}
  }
}

function listWorkspaceFavorites(workspaceRoots = []) {
  return [...new Set((workspaceRoots || []).filter(Boolean).map((path) => resolve(path)))].map((path) => ({
    name: path.split(/[\\/]/).filter(Boolean).pop() || path,
    path,
    kind: 'favorite',
  }));
}

async function listFilesystemRoots(workspaceRoots = []) {
  const favorites = listWorkspaceFavorites(workspaceRoots);
  if (process.platform !== 'win32') {
    return {
      favorites,
      roots: [{ name: '/', path: '/', kind: 'root' }],
    };
  }

  const roots = [];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const drive = `${letter}:\\`;
    try {
      await access(drive);
      roots.push({ name: `${letter}:`, path: drive, kind: 'root' });
    } catch {}
  }
  return { favorites, roots };
}

async function readDirectoryEntries(base, { query = '', limit = WORKSPACE_LIST_LIMIT } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const entries = await readdir(base, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => !normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
    .map((entry) => ({ name: entry.name, path: resolve(base, entry.name), kind: 'directory' }));
  return {
    dirs: dirs.slice(0, limit),
    total: dirs.length,
    truncated: dirs.length > limit,
  };
}

async function listDirectoriesForPath(inputPath, workspaceRoots = [], options = {}) {
  const home = process.env.HOME || process.cwd();
  const requestedRaw = String(inputPath || '').trim();
  const query = String(options.query || '').trim();
  const limit = Math.max(25, Math.min(Number(options.limit) || WORKSPACE_LIST_LIMIT, WORKSPACE_LIST_LIMIT));

  if (!requestedRaw || requestedRaw === '__roots__') {
    const filter = query.toLowerCase();
    const { favorites, roots } = await listFilesystemRoots(workspaceRoots);
    const match = (entry) => !filter || entry.name.toLowerCase().includes(filter) || entry.path.toLowerCase().includes(filter);
    return {
      mode: 'roots',
      base: '',
      query,
      favorites: favorites.filter(match),
      roots: roots.filter(match),
      dirs: [],
      total: 0,
      truncated: false,
    };
  }

  const requested = requestedRaw.replace(/^~(?=$|[\\/])/, home);
  try {
    const base = resolve(requested);
    const result = await readDirectoryEntries(base, { query, limit });
    return { mode: 'children', base, query, ...result };
  } catch {
    const parent = resolve(requested, '..');
    try {
      const partial = requested.split(/[\\/]/).pop()?.toLowerCase() || '';
      const result = await readDirectoryEntries(parent, { query: query || partial, limit });
      return { mode: 'children', base: parent, partial, query: query || partial, ...result };
    } catch {
      return { mode: 'children', base: resolve(requested), query, dirs: [], total: 0, truncated: false };
    }
  }
}

async function resolveWorkingDirectoryOrThrow(inputPath) {
  const requested = String(inputPath || '').trim();
  const normalized = resolve(requested || process.cwd());
  try {
    await readdir(normalized, { withFileTypes: true });
    return normalized;
  } catch {
    const shownPath = requested || normalized;
    throw new Error(`Directory not found on this daemon: ${shownPath}`);
  }
}

function resolveInstalledAgentBinary(binName) {
  if (!binName) return null;
  const binaryNames = process.platform === 'win32'
    ? [`${binName}.cmd`, `${binName}.exe`, `${binName}.bat`, binName]
    : [binName];
  const searchDirs = [
    resolve(DAEMON_DIR, 'node_modules', '.bin'),
    resolve(DAEMON_DIR, '..', 'node_modules', '.bin'),
    resolve(PROJECT_ROOT, 'node_modules', '.bin'),
    resolve(process.cwd(), 'node_modules', '.bin'),
    ...String(process.env.PATH || '').split(delimiter).filter(Boolean),
  ];
  const seenDirs = new Set();
  for (const dir of searchDirs) {
    if (!dir || seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    for (const binaryName of binaryNames) {
      const candidate = resolve(dir, binaryName);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveAcpLaunch(config) {
  const installedBinary = resolveInstalledAgentBinary(config.binName);
  if (installedBinary) {
    return {
      command: installedBinary,
      args: config.binArgs || [],
      source: 'installed-binary',
    };
  }
  if (config.npxPackage) {
    return {
      command: 'npx',
      args: [config.npxPackage, ...(config.npxArgs || [])],
      source: 'npx-fallback',
    };
  }
  return {
    command: config.command,
    args: config.args || [],
    source: 'npx-fallback',
  };
}

async function sendDaemonPresence(type, details) {
  if (shuttingDown && type !== 'daemon.offline') return;
  if (!details) return;
  if (type === 'daemon.offline') {
    await postDaemonPortal('/api/daemons/offline', details);
    return;
  }
  if (type === 'daemon.online') {
    const path = botChat ? '/api/daemons/heartbeat' : '/api/daemons/register';
    await postDaemonPortal(path, details);
  }
}

async function fetchBotTokenUrl() {
  const body = await postDaemonPortal('/api/daemons/register', daemonPresenceInfo || {});
  if (!body?.url) {
    throw new Error('Portal daemon registration did not return a token URL');
  }
  console.log('[Daemon] Registered with portal control plane');
  return body.url;
}

function scheduleBotReconnect() {
  if (shuttingDown || botReconnectTimer || botChatInitPromise) return;
  const delay = Math.min(30000, 1000 * (2 ** botReconnectAttempt));
  botReconnectAttempt += 1;
  botReconnectTimer = setTimeout(() => {
    botReconnectTimer = null;
    void ensureBotChatReady().catch((error) => {
      console.error('[Daemon] Bot reconnect failed:', error?.message || error);
      scheduleBotReconnect();
    });
  }, delay);
  botReconnectTimer.unref?.();
}

async function loginBotChat() {
  if (botChat) return botChat;
  if (botChatInitPromise) return botChatInitPromise;

  botChatInitPromise = (async () => {
    const tokenUrl = await fetchBotTokenUrl();
    const chat = await new ChatClient(tokenUrl).login();
    console.log(`[Daemon] Bot logged in as: ${chat.userId}`);

    chat.onConnected(() => {
      botReconnectAttempt = 0;
    });
    chat.onDisconnected(() => {
      if (shuttingDown) return;
      console.warn('[Daemon] Bot chat disconnected; scheduling reconnect');
      if (botChat === chat) botChat = null;
      scheduleBotReconnect();
    });
    chat.addListenerForNewMessage(handleBotNotification);

    await ensureRoomMembership(chat, DAEMON_CONTROL_ROOM, 'Daemon Control', BOT_USER_ID, [PORTAL_CONTROL_USER_ID]);
    botChat = chat;

    return chat;
  })().finally(() => {
    botChatInitPromise = null;
  });

  return botChatInitPromise;
}

async function ensureBotChatReady() {
  if (botChat) return botChat;
  return loginBotChat();
}

// ── Delta Debounce ──

const deltaBuffers = new Map();

function sendDelta(roomId, key, deltaContent, envelopeType = 'assistant.delta', idField = 'messageId', idValue = key) {
  let buf = deltaBuffers.get(key);
  if (!buf) { buf = { roomId, content: '', timer: null, envelopeType, idField, idValue }; deltaBuffers.set(key, buf); }
  buf.content += deltaContent;
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    const flushed = buf.content; buf.content = ''; deltaBuffers.delete(key);
    botSend(roomId, { type: buf.envelopeType, [buf.idField]: buf.idValue, content: flushed });
  }, 80);
}

function flushDelta(key) {
  const buf = deltaBuffers.get(key);
  if (buf && buf.content) {
    if (buf.timer) clearTimeout(buf.timer);
    botSend(buf.roomId, { type: buf.envelopeType, [buf.idField]: buf.idValue, content: buf.content });
    deltaBuffers.delete(key);
  }
}

function isGenericToolName(name) {
  const value = String(name || '').trim().toLowerCase();
  return !value || value === 'tool' || value === 'terminal';
}

function looksLikeCommand(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (['tool', 'terminal', 'bash'].includes(lower)) return false;
  return /^([a-z0-9_.-]+)(\s|$)/i.test(text) && (text.includes(' ') || text.includes('/') || text.includes('\\') || text.includes('--'));
}

function normalizeToolArgs(input, title) {
  if (input && (typeof input !== 'object' || Object.keys(input).length > 0)) return input;
  if (looksLikeCommand(title)) return { command: title };
  return input;
}

function normalizeToolOutput(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const parts = [];
    if (typeof value.stdout === 'string' && value.stdout.trim()) parts.push(value.stdout.trimEnd());
    if (typeof value.stderr === 'string' && value.stderr.trim()) parts.push(`stderr:\n${value.stderr.trimEnd()}`);
    if (typeof value.message === 'string' && value.message.trim() && !parts.length) parts.push(value.message.trim());
    if (value.interrupted) parts.push('[interrupted]');
    if (!parts.length) {
      try { return JSON.stringify(value, null, 2); } catch { return String(value); }
    }
    return parts.join('\n\n');
  }
  return String(value);
}

function mergeToolOutput(current, next) {
  if (!next || !String(next).trim()) return current || '';
  if (!current) return next;
  if (current === next || current.includes(next)) return current;
  if (next.includes(current)) return next;
  return `${current}\n${next}`;
}

function pickToolName(currentName, metaToolName, updateToolName, title) {
  for (const candidate of [metaToolName, updateToolName]) {
    if (candidate && !isGenericToolName(candidate)) return candidate;
  }
  if (currentName && !isGenericToolName(currentName)) return currentName;
  if (title && !looksLikeCommand(title)) return title;
  return currentName || metaToolName || updateToolName || title || 'Tool';
}

function flushCompletedToolInvocations(sessionId, excludeToolCallId = null) {
  const state = sessions.get(sessionId);
  if (!state?.toolInvocations) return;
  for (const [toolCallId, invocation] of state.toolInvocations.entries()) {
    if (!invocation?.completedPending) continue;
    if (excludeToolCallId && toolCallId === excludeToolCallId) continue;
    botSend(sessionId, {
      type: 'tool.complete',
      toolCallId,
      name: invocation.name || 'Tool',
      success: invocation.success !== false,
      args: invocation.args,
      result: invocation.output || '',
    });
    state.toolInvocations.delete(toolCallId);
  }
}

function clearAcpIdleTimer(state) {
  if (!state?.acpIdleTimer) return;
  clearTimeout(state.acpIdleTimer);
  state.acpIdleTimer = null;
}

function noteAcpActivity(state) {
  if (!state) return;
  state.acpLastActivityAt = Date.now();
  clearAcpIdleTimer(state);
}

function flushAcpBufferedContent(state, roomId) {
  const client = state?._acpClient;
  if (!client) return;
  if (client._currentMessageText) {
    const messageId = `acp-msg-${client._msgCounter++}`;
    flushDelta(messageId);
    botSend(roomId, { type: 'assistant.message', messageId, content: client._currentMessageText });
    client._currentMessageText = '';
  }
  if (client._currentThoughtText) {
    const reasoningId = `acp-reason-${client._reasonCounter++}`;
    flushDelta(`reasoning-${reasoningId}`);
    botSend(roomId, { type: 'assistant.reasoning', reasoningId, content: client._currentThoughtText });
    client._currentThoughtText = '';
  }
}

function hasPendingAcpToolInvocations(state) {
  if (!state?.toolInvocations?.size) return false;
  for (const invocation of state.toolInvocations.values()) {
    if (invocation && invocation.started && !invocation.completedPending) return true;
  }
  return false;
}

function scheduleAcpIdleSettlement(state, roomId, delay = ACP_IDLE_GRACE_MS) {
  if (!state?.acpAwaitingIdle) return;
  clearAcpIdleTimer(state);
  state.acpIdleTimer = setTimeout(() => {
    state.acpIdleTimer = null;
    finalizeAcpPromptTurn(state, roomId);
  }, Math.max(0, delay));
  state.acpIdleTimer.unref?.();
}

function finalizeAcpPromptTurn(state, roomId) {
  if (!state?.acpAwaitingIdle) return;
  if (sessions.get(roomId) !== state) return;
  const quietMs = Date.now() - (state.acpLastActivityAt || 0);
  if (quietMs < ACP_IDLE_GRACE_MS) {
    scheduleAcpIdleSettlement(state, roomId, ACP_IDLE_GRACE_MS - quietMs);
    return;
  }

  flushAcpBufferedContent(state, roomId);
  if (hasPendingAcpToolInvocations(state)) {
    scheduleAcpIdleSettlement(state, roomId, ACP_IDLE_GRACE_MS);
    return;
  }

  flushCompletedToolInvocations(roomId);
  state.acpAwaitingIdle = false;
  state.isProcessing = false;
  state.isStopping = false;
  state.pendingCount = 0;
  botSend(roomId, { type: 'session.idle' });
  emitSessionState(roomId);
}

function beginAcpIdleSettlement(state, roomId) {
  if (!state) return;
  state.acpAwaitingIdle = true;
  scheduleAcpIdleSettlement(state, roomId);
}

// ── Session Helpers ──

function emitSessionState(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) return;
  botSend(sessionId, { type: 'session.state', ready: !!state.isReady, processing: state.isProcessing, stopping: state.isStopping, pendingCount: state.pendingCount, model: state.model });
}

function deactivateSession(sessionId, message) {
  const state = sessions.get(sessionId);
  if (!state) return;
  cleanupClientTerminals(state._acpClient);
  clearAcpIdleTimer(state);
  state.active = false;
  state.isReady = false;
  state.isProcessing = false;
  state.isStopping = false;
  state.startupPromise = null;
  state.pendingCount = 0;
  state.acpAwaitingIdle = false;
  state.acpConnection = null;
  state.acpSessionId = null;
  state.acpProcess = null;
  state._acpClient = null;
  state.isResuming = false;
  state.toolInvocations.clear();
  for (const pending of state.pendingPermissions.values()) {
    try { pending.resolve(false); } catch {}
  }
  state.pendingPermissions.clear();
  botSend(sessionId, { type: 'session.error', message });
  emitSessionState(sessionId);
}

function isCancellationError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return error?.code === -32800 || text.includes('cancelled') || text.includes('canceled') || text.includes('aborted');
}

async function cancelSessionTurn(state, roomId) {
  if (!state || (!state.isProcessing && !state.isStopping)) return false;
  if (state.isStopping) return true;
  state.isStopping = true;
  state.pendingCount = 0;
  emitSessionState(roomId);

  for (const [requestId, pending] of state.pendingPermissions.entries()) {
    try { pending.resolve(false); } catch {}
    state.pendingPermissions.delete(requestId);
    botSend(roomId, { type: 'permission.response', requestId, approved: false, cancelled: true });
  }

  if (state.copilotSession?.abort) {
    await state.copilotSession.abort();
    return true;
  }
  if (state.acpConnection && state.acpSessionId) {
    await state.acpConnection.cancel({ sessionId: state.acpSessionId });
    return true;
  }

  state.isStopping = false;
  emitSessionState(roomId);
  return false;
}

async function sendSessionPrompt(state, roomId, prompt) {
  if (state.active === false) {
    botSend(roomId, { type: 'session.error', message: 'This agent session is no longer active. Create a new session.' });
    return;
  }
  if (state.startupPromise) {
    try {
      await state.startupPromise;
    } catch {
      return;
    }
  }
  // SDK mode
  if (state.copilotSession) {
    state.isProcessing = true;
    state.isStopping = false;
    emitSessionState(roomId);
    try {
      await state.copilotSession.send({ prompt });
    } catch (err) {
      if (!state.isStopping || !isCancellationError(err)) {
        botSend(roomId, { type: 'session.error', message: err.message });
      }
    }
    return;
  }
  // ACP mode
  if (!state.acpConnection) {
    botSend(roomId, { type: 'session.error', message: 'Agent is still starting… please wait.' });
    return;
  }
  state.isProcessing = true;
  state.isStopping = false;
  state.acpAwaitingIdle = false;
  noteAcpActivity(state);
  emitSessionState(roomId);
  try {
    const response = await state.acpConnection.prompt({ sessionId: state.acpSessionId, prompt: [{ type: 'text', text: prompt }] });
    flushCompletedToolInvocations(roomId);
    flushAcpBufferedContent(state, roomId);
    if (response?.stopReason === 'cancelled') {
      state.isStopping = false;
    }
  } catch (err) {
    if (!state.isStopping || !isCancellationError(err)) {
      botSend(roomId, { type: 'session.error', message: err.message });
    }
    beginAcpIdleSettlement(state, roomId);
    return;
  }
  beginAcpIdleSettlement(state, roomId);
}

// ── ACP Session Creation ──

function isAuthenticationRequiredError(error, authMessage = '') {
  const text = String(authMessage || [error?.message, error?.data?.details, error?.data?.message].filter(Boolean).join(' | ')).toLowerCase();
  return error?.code === -32000
    || text.includes('authentication required')
    || text.includes('auth required')
    || (error?.code === -32603 && text.includes('required') && (text.includes('auth') || text.includes('authentication')));
}

function buildAcpAuthenticationGuidance(agentName, error) {
  const details = [error?.message, error?.data?.details, error?.data?.message].filter(Boolean).join(' | ');
  if (agentName === 'copilot') {
    return `Copilot CLI authentication is not usable on this machine yet. Run \"copilot auth login\" or set COPILOT_GITHUB_TOKEN/GITHUB_COPILOT_TOKEN in the daemon environment, then retry.${details ? ` Details: ${details}` : ''}`;
  }
  return `Authentication required for ${agentName}.${details ? ` Details: ${details}` : ''}`;
}

function killChildProcess(child) {
  if (!child) return;
  try { child.kill('SIGTERM'); } catch {}
}

async function withTimeout(promise, timeoutMs, label, onTimeout = () => {}) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout(); } catch {}
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createAcpSession(sessionId, agentName, workingDirectory) {
  const config = ACP_AGENTS[agentName];
  if (!config) throw new Error(`Unknown ACP agent: ${agentName}`);
  const launch = resolveAcpLaunch(config);

  console.log(`[Daemon] Spawning ${agentName}: ${launch.command} ${(launch.args || []).join(' ')} [${launch.source}]`);

  const child = spawnAcpChild(sessionId, agentName, launch);

  const readable = Readable.toWeb(child.stdout);
  const writable = Writable.toWeb(child.stdin);
  const stream = ndJsonStream(writable, readable);
  const client = createAcpClient(sessionId);
  const connection = new ClientSideConnection((agent) => { client._agent = agent; return client; }, stream);

  const timeoutHandler = () => {
    console.error(`[Daemon] ACP startup timed out for ${agentName}`);
    killChildProcess(child);
  };

  const initResponse = await withTimeout(connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: 'codeagenthub-daemon', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  }), ACP_STARTUP_TIMEOUT_MS, `ACP initialize for ${agentName}`, timeoutHandler);
  console.log(`[Daemon] Initialized: ${initResponse.agentInfo?.name || agentName} v${initResponse.agentInfo?.version || '?'}`);

  const sessionResponse = await (async () => {
    try {
      return await withTimeout(
        connection.newSession({ cwd: workingDirectory, mcpServers: [] }),
        ACP_STARTUP_TIMEOUT_MS,
        `ACP newSession for ${agentName}`,
        timeoutHandler,
      );
    } catch (e) {
      const authMessage = [e?.message, e?.data?.details, e?.data?.message].filter(Boolean).join(' | ');
      const authRequired = isAuthenticationRequiredError(e, authMessage);
      if (!authRequired) throw e;
      const authMethods = initResponse.authMethods;
      if (!authMethods?.length) throw new Error(`Agent "${agentName}" requires auth but advertised no methods`);
      console.log(`[Daemon] Auth required. Using: ${authMethods[0].name}`);
      await withTimeout(
        connection.authenticate({ methodId: authMethods[0].id }),
        ACP_STARTUP_TIMEOUT_MS,
        `ACP authenticate for ${agentName}`,
        timeoutHandler,
      );
      console.log(`[Daemon] Auth successful`);
      try {
        return await withTimeout(
          connection.newSession({ cwd: workingDirectory, mcpServers: [] }),
          ACP_STARTUP_TIMEOUT_MS,
          `ACP newSession for ${agentName}`,
          timeoutHandler,
        );
      } catch (retryError) {
        if (isAuthenticationRequiredError(retryError)) {
          throw new Error(buildAcpAuthenticationGuidance(agentName, retryError));
        }
        throw retryError;
      }
    }
  })();
  console.log(`[Daemon] ACP session: ${sessionResponse.sessionId}`);

  return {
    connection,
    client,
    acpSessionId: sessionResponse.sessionId,
    process: child,
    displayName: initResponse.agentInfo?.title || initResponse.agentInfo?.name || config.displayName,
    initResponse,
    sessionResponse,
  };
}

async function resumeAcpSession(sessionId, agentName, acpSessionId, workingDirectory) {
  const config = ACP_AGENTS[agentName];
  if (!config) throw new Error(`Unknown ACP agent: ${agentName}`);
  const launch = resolveAcpLaunch(config);

  console.log(`[Daemon] Resuming ${agentName}: ${acpSessionId} [${launch.source}]`);

  const child = spawnAcpChild(sessionId, agentName, launch);

  const readable = Readable.toWeb(child.stdout);
  const writable = Writable.toWeb(child.stdin);
  const stream = ndJsonStream(writable, readable);
  const client = createAcpClient(sessionId);
  const connection = new ClientSideConnection((agent) => { client._agent = agent; return client; }, stream);

  const timeoutHandler = () => {
    console.error(`[Daemon] ACP resume timed out for ${agentName}`);
    killChildProcess(child);
  };

  const initResponse = await withTimeout(connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: 'codeagenthub-daemon', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  }), ACP_STARTUP_TIMEOUT_MS, `ACP initialize for ${agentName}`, timeoutHandler);

  const loadResponse = await (async () => {
    try {
      return await withTimeout(
        connection.loadSession({ sessionId: acpSessionId, cwd: workingDirectory, mcpServers: [] }),
        ACP_STARTUP_TIMEOUT_MS,
        `ACP loadSession for ${agentName}`,
        timeoutHandler,
      );
    } catch (e) {
      const authMessage = [e?.message, e?.data?.details, e?.data?.message].filter(Boolean).join(' | ');
      const authRequired = isAuthenticationRequiredError(e, authMessage);
      if (!authRequired) throw e;
      const authMethods = initResponse.authMethods;
      if (!authMethods?.length) throw new Error(`Agent "${agentName}" requires auth but advertised no methods`);
      console.log(`[Daemon] Auth required for resume. Using: ${authMethods[0].name}`);
      await withTimeout(
        connection.authenticate({ methodId: authMethods[0].id }),
        ACP_STARTUP_TIMEOUT_MS,
        `ACP authenticate for ${agentName}`,
        timeoutHandler,
      );
      try {
        return await withTimeout(
          connection.loadSession({ sessionId: acpSessionId, cwd: workingDirectory, mcpServers: [] }),
          ACP_STARTUP_TIMEOUT_MS,
          `ACP loadSession for ${agentName}`,
          timeoutHandler,
        );
      } catch (retryError) {
        if (isAuthenticationRequiredError(retryError)) {
          throw new Error(buildAcpAuthenticationGuidance(agentName, retryError));
        }
        throw retryError;
      }
    }
  })();

  return {
    connection,
    client,
    acpSessionId,
    process: child,
    displayName: initResponse.agentInfo?.title || initResponse.agentInfo?.name || config.displayName,
    initResponse,
    loadResponse,
  };
}

async function resumeSdkSession(roomId, savedInfo) {
  const client = await ensureCopilotSdkClient();
  return client.resumeSession(savedInfo.copilotSessionId, {
    model: savedInfo.model || DEFAULT_SDK_MODEL,
    streaming: true,
    workingDirectory: savedInfo.cwd || process.cwd(),
    onPermissionRequest: createSdkPermissionHandler(roomId),
  });
}

async function handleModelSwitch(state, roomId, modelId) {
  if (!modelId) return;
  if (state.active === false) {
    await botSend(roomId, { type: 'session.error', message: 'This agent session is no longer active. Create a new session.' });
    return;
  }
  if (state.startupPromise) {
    try {
      await state.startupPromise;
    } catch {
      return;
    }
  }
  if (state.copilotSession) {
    await sendSessionPrompt(state, roomId, `/model ${modelId}`);
    return;
  }
  if (!state.acpConnection || !state.acpSessionId) {
    await botSend(roomId, { type: 'session.error', message: 'Agent is still starting… please wait.' });
    return;
  }
  if (typeof state.acpConnection.unstable_setSessionModel !== 'function') {
    await botSend(roomId, { type: 'session.error', message: 'This agent does not support runtime model switching.' });
    return;
  }
  try {
    await state.acpConnection.unstable_setSessionModel({ sessionId: state.acpSessionId, modelId });
    state.model = modelId;
    state.currentModelId = modelId;
    updateSessionRecord(roomId, { model: modelId });
    emitModelsUpdate(roomId, state);
    emitSessionState(roomId);
    await botSend(roomId, { type: 'system.info', message: `Model: ${modelId}` });
  } catch (err) {
    const message = err?.code === -32601
      ? 'This agent does not support runtime model switching.'
      : `Model switch failed: ${err.message}`;
    await botSend(roomId, { type: 'session.error', message });
  }
}

async function handleModeSwitch(state, roomId, modeId) {
  if (!modeId) return;
  if (state.active === false) {
    await botSend(roomId, { type: 'session.error', message: 'This agent session is no longer active. Create a new session.' });
    return;
  }
  if (state.startupPromise) {
    try {
      await state.startupPromise;
    } catch {
      return;
    }
  }
  if (state.copilotSession) {
    await sendSessionPrompt(state, roomId, `/mode ${modeId}`);
    return;
  }
  if (!state.acpConnection || !state.acpSessionId) {
    await botSend(roomId, { type: 'session.error', message: 'Agent is still starting… please wait.' });
    return;
  }
  if (typeof state.acpConnection.setSessionMode !== 'function') {
    await botSend(roomId, { type: 'session.error', message: 'This agent does not support mode switching.' });
    return;
  }
  try {
    await state.acpConnection.setSessionMode({ sessionId: state.acpSessionId, modeId });
    state.currentModeId = modeId;
    emitModesUpdate(roomId, state);
    await botSend(roomId, { type: 'mode.changed', currentModeId: modeId });
    await botSend(roomId, { type: 'system.info', message: `Mode: ${modeId}` });
  } catch (err) {
    const message = err?.code === -32601
      ? 'This agent does not support mode switching.'
      : `Mode switch failed: ${err.message}`;
    await botSend(roomId, { type: 'session.error', message });
  }
}

async function tryResumeSession(roomId, envelope) {
  if (resumePromises.has(roomId)) {
    return resumePromises.get(roomId);
  }

  let state = sessions.get(roomId);
  const shouldTryResume = (!state || state.active === false)
    && (envelope.type === 'user.prompt' || envelope.type === 'user.command' || envelope.type === 'session.sync_state');
  if (!shouldTryResume) return state;

  const saved = sessionStore[roomId];
  if (!saved?.supportsResume) return state;

  const resumePromise = (async () => {
    console.log(`[Daemon] Auto-resuming session for room ${roomId} (${saved.agentName})`);
    await botSend(roomId, { type: 'system.info', message: 'Resuming session…' });

    try {
      if (state?.active === false) sessions.delete(roomId);

      if (saved.agentName === 'copilot-sdk') {
        state = createSessionState({
          sessionId: roomId,
          agentName: 'copilot-sdk',
          workingDirectory: saved.cwd || process.cwd(),
          model: saved.model || DEFAULT_SDK_MODEL,
        });
        state.isResuming = true;
        sessions.set(roomId, state);
        state.copilotSession = await resumeSdkSession(roomId, saved);
        state.active = true;
        state.isReady = true;
        state.isResuming = false;
        state.currentModelId = saved.model || state.model;
        bindCopilotSdkEvents(state);
        await refreshSdkModels(state);
        emitSessionState(roomId);
        await botSend(roomId, { type: 'system.info', message: 'Resumed GitHub Copilot (SDK)' });
        return state;
      }

      state = createSessionState({
        sessionId: roomId,
        agentName: saved.agentName,
        workingDirectory: saved.cwd || process.cwd(),
        model: saved.model || 'default',
      });
      state.isResuming = true;
      sessions.set(roomId, state);
      const acp = await resumeAcpSession(roomId, saved.agentName, saved.acpSessionId, saved.cwd || process.cwd());
      Object.assign(state, {
        acpConnection: acp.connection,
        acpSessionId: acp.acpSessionId,
        acpProcess: acp.process,
        _acpClient: acp.client,
        active: true,
        isReady: true,
        isResuming: false,
      });
      handleSessionCapabilities(state, roomId, acp.loadResponse);
      emitSessionState(roomId);
      await botSend(roomId, { type: 'system.info', message: `Resumed ${acp.displayName}` });
      return state;
    } catch (err) {
      if (saved.agentName === 'copilot-sdk' && /Session not found:/i.test(String(err?.message || ''))) {
        console.warn('[Daemon] SDK resume target missing, recreating session:', roomId);
        state = createSessionState({
          sessionId: roomId,
          agentName: 'copilot-sdk',
          workingDirectory: saved.cwd || process.cwd(),
          model: saved.model || DEFAULT_SDK_MODEL,
        });
        state.isResuming = true;
        sessions.set(roomId, state);
        await startSdkSession(roomId, state, {
          model: saved.model || DEFAULT_SDK_MODEL,
          workingDirectory: saved.cwd || process.cwd(),
        });
        state.isReady = true;
        state.isResuming = false;
        emitSessionState(roomId);
        await botSend(roomId, {
          type: 'system.info',
          message: 'Previous SDK session could not be resumed; started a new GitHub Copilot (SDK) session.',
        });
        return state;
      }
      console.error('[Daemon] Resume failed:', err.message);
      sessions.delete(roomId);
      deleteSessionRecord(roomId);
      await botSend(roomId, { type: 'session.error', message: `Resume failed: ${err.message}. Please create a new session.` });
      return null;
    }
  })().finally(() => {
    resumePromises.delete(roomId);
    const latestState = sessions.get(roomId);
    if (latestState) latestState.isResuming = false;
  });

  resumePromises.set(roomId, resumePromise);
  return resumePromise;
}

async function handleBotNotification(notification) {
  try {
    const msg = notification.message;
    const roomId = notification.conversation?.roomId;
    if (msg.createdBy === BOT_USER_ID || !roomId || !msg.content?.text) return;

    let envelope;
    try { envelope = JSON.parse(msg.content.text); } catch { return; }

    if (roomId === DAEMON_CONTROL_ROOM) {
      if (envelope.type === 'workspace.list_request' && envelope.daemonId === BOT_USER_ID && envelope.requestId && envelope.requesterUserId) {
        const result = await listDirectoriesForPath(envelope.path, advertisedWorkspaces, {
          query: envelope.query,
          limit: envelope.limit,
        });
        await botSend(DAEMON_CONTROL_ROOM, {
          type: 'workspace.list_response',
          requestId: envelope.requestId,
          requesterUserId: envelope.requesterUserId,
          daemonId: BOT_USER_ID,
          ...result,
        });
      }
      return;
    }

    if (envelope.type === 'control.create') {
      if (!isPortalControlUser(msg.createdBy)) {
        console.warn(`[Daemon] Ignoring unauthorized create from ${msg.createdBy} for room ${roomId}`);
        return;
      }
      const { userId, agentName, workingDirectory, initialPrompt, model } = envelope;
      console.log(`[Daemon] control.create: agent=${agentName} dir=${workingDirectory}`);
      let selectedWorkingDirectory;
      try {
        selectedWorkingDirectory = await resolveWorkingDirectoryOrThrow(workingDirectory);
      } catch (err) {
        await botSend(roomId, { type: 'session.error', message: err.message });
        return;
      }
      const existingState = sessions.get(roomId);
      if (existingState) {
        await stopExistingSession(existingState);
        sessions.delete(roomId);
      }
      const state = createSessionState({
        sessionId: roomId,
        agentName,
        firstPrompt: initialPrompt || '',
        ownerUserId: userId,
        workingDirectory: selectedWorkingDirectory,
        model: model || (agentName === 'copilot-sdk' ? DEFAULT_SDK_MODEL : 'default'),
      });
      sessions.set(roomId, state);
      emitSessionState(roomId);

      if (agentName === 'copilot-sdk') {
        await botSend(roomId, { type: 'system.info', message: 'Starting GitHub Copilot (SDK)…' });
        try {
          state.startupPromise = (async () => {
            await startSdkSession(roomId, state, { model, workingDirectory: selectedWorkingDirectory });
            state.isReady = true;
          })();
          await state.startupPromise;
          await botSend(roomId, { type: 'system.info', message: 'Connected to GitHub Copilot (SDK)' });
          emitSessionState(roomId);
          if (initialPrompt) {
            await sendSessionPrompt(state, roomId, initialPrompt);
          }
        } catch (err) {
          console.error('[Daemon] Copilot SDK failed:', err.message);
          deactivateSession(roomId, `Failed to start: ${err.message}`);
        } finally {
          state.startupPromise = null;
        }
      } else {
        await botSend(roomId, { type: 'system.info', message: `Starting ${ACP_AGENTS[agentName]?.displayName || agentName}…` });
        try {
          let connectedDisplayName = ACP_AGENTS[agentName]?.displayName || agentName;
          state.startupPromise = (async () => {
            const acp = await createAcpSession(roomId, agentName, selectedWorkingDirectory);
            Object.assign(state, { acpConnection: acp.connection, acpSessionId: acp.acpSessionId, acpProcess: acp.process, _acpClient: acp.client, active: true, isReady: true });
            connectedDisplayName = acp.displayName || connectedDisplayName;
            handleSessionCapabilities(state, roomId, acp.sessionResponse || acp.loadResponse || acp.initResponse);
            persistSessionRecord(roomId, {
              agentName,
              acpSessionId: acp.acpSessionId,
              cwd: selectedWorkingDirectory,
              supportsResume: acp.initResponse.agentCapabilities?.loadSession ?? false,
            });
          })();
          await state.startupPromise;
          await botSend(roomId, { type: 'system.info', message: `Connected to ${connectedDisplayName}` });
          emitSessionState(roomId);
          if (initialPrompt) await sendSessionPrompt(state, roomId, initialPrompt);
        } catch (err) {
          console.error('[Daemon] Spawn failed:', err.message);
          deactivateSession(roomId, `Failed to start: ${err.message}`);
        } finally {
          state.startupPromise = null;
        }
      }
      return;
    }

    if (envelope.type === 'control.delete') {
      const state = sessions.get(roomId);
      if (!isPortalControlUser(msg.createdBy) && !isSessionOwner(state, msg.createdBy)) {
        console.warn(`[Daemon] Ignoring unauthorized delete from ${msg.createdBy} for room ${roomId}`);
        return;
      }
      await stopExistingSession(state);
      sessions.delete(roomId);
      deleteSessionRecord(roomId);
      console.log(`[Daemon] Session deleted: ${roomId}`);
      return;
    }

    if (envelope.type === 'control.cancel') {
      const state = sessions.get(roomId);
      if (!state) return;
      if (!isPortalControlUser(msg.createdBy) && !isSessionOwner(state, msg.createdBy)) {
        console.warn(`[Daemon] Ignoring unauthorized cancel from ${msg.createdBy} for room ${roomId}`);
        return;
      }
      try {
        await cancelSessionTurn(state, roomId);
      } catch (err) {
        state.isStopping = false;
        emitSessionState(roomId);
        await botSend(roomId, { type: 'session.error', message: `Failed to stop current response: ${err.message}` });
      }
      return;
    }

    const state = await tryResumeSession(roomId, envelope) || sessions.get(roomId);
    if (!state) return;

    switch (envelope.type) {
      case 'user.prompt':
        if (envelope.content) {
          console.log(`[Daemon] Prompt: ${envelope.content.substring(0, 80)}`);
          await sendSessionPrompt(state, roomId, envelope.content);
        }
        break;
      case 'user.command':
        if (envelope.command) {
          const cmd = envelope.command.trim();
          console.log(`[Daemon] Command: ${cmd}`);
          if (cmd === '/clear') {
            await botSend(roomId, { type: 'system.clear' });
            break;
          }
          if (cmd.startsWith('/model ')) {
            await handleModelSwitch(state, roomId, cmd.slice(7).trim());
            break;
          }
          if (cmd.startsWith('/mode ')) {
            await handleModeSwitch(state, roomId, cmd.slice(6).trim());
            break;
          }
          await sendSessionPrompt(state, roomId, cmd);
        }
        break;
      case 'permission.response':
        if (envelope.requestId) {
          if (!isSessionOwner(state, msg.createdBy)) {
            console.warn(`[Daemon] Ignoring unauthorized permission response from ${msg.createdBy} for room ${roomId}`);
            break;
          }
          const pending = state.pendingPermissions.get(envelope.requestId);
          if (pending) {
            console.log(`[Daemon] Permission ${envelope.approved ? '✓' : '✕'}: ${envelope.requestId.substring(0, 8)}`);
            pending.resolve(!!envelope.approved);
            state.pendingPermissions.delete(envelope.requestId);
          }
        }
        break;
      case 'session.sync_state':
        syncSessionUiState(roomId, state);
        break;
    }
  } catch (err) {
    console.error('[Daemon] Error:', err);
  }
}

// ── ACP Client (events + local fs/terminal) ──

function createAcpClient(sessionId) {
  return {
    _agent: null, _currentMessageText: '', _currentThoughtText: '', _msgCounter: 0, _reasonCounter: 0,

    async requestPermission(params) {
      const state = sessions.get(sessionId);
      if (!state) return { outcome: { outcome: 'cancelled' } };
      const requestId = randomUUID();
      await botSend(sessionId, { type: 'permission.request', requestId, kind: 'shell', description: params.toolCall?.title || 'Permission', ...params });
      return new Promise((resolve) => {
        state.pendingPermissions.set(requestId, {
          resolve: (approved) => {
            const allowOpt = params.options?.find(o => o.kind?.startsWith('allow'));
            resolve(approved ? { outcome: { outcome: 'selected', optionId: allowOpt?.optionId || params.options?.[0]?.optionId } } : { outcome: { outcome: 'cancelled' } });
          }, request: params, timestamp: Date.now(),
        });
        setTimeout(() => { if (state.pendingPermissions.has(requestId)) { state.pendingPermissions.delete(requestId); resolve({ outcome: { outcome: 'cancelled' } }); } }, 5 * 60 * 1000);
      });
    },

    async sessionUpdate(params) {
      const update = params.update;
      const type = update?.sessionUpdate;
      const state = sessions.get(sessionId);
      noteAcpActivity(state);
      if (state?.isResuming) {
        if (!['available_commands_update', 'current_mode_update', 'usage_update', 'config_option_update'].includes(type)) {
          return;
        }
      }
      // Debug: log full update structure for tool events
      if (type === 'tool_call' || type === 'tool_call_update') {
        const debugKeys = Object.keys(update).filter(k => k !== 'sessionUpdate');
        const meta = update._meta?.claudeCode;
        console.log(`[Daemon:acp] ${type} keys=[${debugKeys}] meta=${meta ? JSON.stringify(meta).substring(0, 120) : 'none'} rawOutput=${update.rawOutput ? JSON.stringify(update.rawOutput).substring(0, 80) : 'none'}`);
      }
      switch (type) {
        case 'config_option_update':
          break;
        case 'user_message_chunk':
          break;
        case 'agent_message_chunk': {
          flushCompletedToolInvocations(sessionId);
          const text = update.content?.text || ''; if (!text) break;
          this._currentMessageText += text;
          sendDelta(sessionId, `acp-msg-${this._msgCounter}`, text);
          break;
        }
        case 'agent_thought_chunk': {
          flushCompletedToolInvocations(sessionId);
          const text = update.content?.text || ''; if (!text) break;
          this._currentThoughtText += text;
          sendDelta(sessionId, `reasoning-acp-reason-${this._reasonCounter}`, text, 'assistant.reasoning_delta', 'reasoningId', `acp-reason-${this._reasonCounter}`);
          break;
        }
        case 'tool_call': {
          if (this._currentMessageText) { const id = `acp-msg-${this._msgCounter++}`; flushDelta(id); botSend(sessionId, { type: 'assistant.message', messageId: id, content: this._currentMessageText }); this._currentMessageText = ''; }
          if (this._currentThoughtText) { const rid = `acp-reason-${this._reasonCounter++}`; flushDelta(`reasoning-${rid}`); botSend(sessionId, { type: 'assistant.reasoning', reasoningId: rid, content: this._currentThoughtText }); this._currentThoughtText = ''; }
          const state = sessions.get(sessionId);
          const tcId = update.toolCallId || randomUUID();
          const meta = update._meta?.claudeCode || {};
          flushCompletedToolInvocations(sessionId, tcId);
          const invocation = state?.toolInvocations?.get(tcId) || { name: 'Tool', args: undefined, output: '', success: true, completedPending: false, started: false };
          const name = pickToolName(invocation.name, meta.toolName, update.toolName, update.title);
          const status = update.status || 'pending';
          const toolInput = normalizeToolArgs(meta.input || update.input, update.title);
          const toolOutput = normalizeToolOutput(update.rawOutput?.content ?? update.toolResponse ?? meta.toolResponse ?? '');
          invocation.name = name;
          invocation.args = invocation.args || toolInput;
          invocation.output = mergeToolOutput(invocation.output, toolOutput);
          invocation.success = invocation.success !== false && status !== 'error';
          invocation.completedPending = status === 'completed' || status === 'error';
          if (state) state.toolInvocations.set(tcId, invocation);
          if (!invocation.started) {
            invocation.started = true;
            botSend(sessionId, { type: 'tool.start', toolCallId: tcId, name, args: invocation.args });
          }
          console.log(`[Daemon:tool] ${name} ${status}${toolOutput ? ` (${String(toolOutput).length} chars)` : ''}`);
          break;
        }
        case 'tool_call_update': {
          if (!update.toolCallId) {
            console.warn('[Daemon:tool] Ignoring tool_call_update without toolCallId');
            break;
          }
          const state = sessions.get(sessionId);
          const tcId = update.toolCallId;
          const status = update.status || 'completed';
          const meta = update._meta?.claudeCode || {};
          flushCompletedToolInvocations(sessionId, tcId);
          const invocation = state?.toolInvocations?.get(tcId) || { name: 'Tool', args: undefined, output: '', success: true, completedPending: false, started: false };
          const name = pickToolName(invocation.name, meta.toolName, update.toolName, update.title);
          const toolInput = normalizeToolArgs(meta.input || update.input, update.title);
          const toolOutput = normalizeToolOutput(update.rawOutput?.content ?? update.toolResponse ?? meta.toolResponse ?? '');
          invocation.name = name;
          invocation.args = invocation.args || toolInput;
          invocation.output = mergeToolOutput(invocation.output, toolOutput);
          invocation.success = invocation.success !== false && status !== 'error';
          invocation.completedPending = status === 'completed' || status === 'error';
          if (state) state.toolInvocations.set(tcId, invocation);
          if (!invocation.started) {
            invocation.started = true;
            botSend(sessionId, { type: 'tool.start', toolCallId: tcId, name, args: invocation.args });
          }
          console.log(`[Daemon:tool] ${name} → ${status}${toolOutput ? ` (${String(toolOutput).length} chars)` : ''}`);
          break;
        }
        case 'session_error':
          flushCompletedToolInvocations(sessionId);
          botSend(sessionId, { type: 'session.error', message: update.message || String(update) });
          break;
        case 'available_commands_update': {
          if (state) state.availableCommands = update.availableCommands || [];
          emitCommandsUpdate(sessionId, update.availableCommands || []);
          break;
        }
        case 'current_mode_update': {
          const modeId = update.currentModeId || '';
          if (state) state.currentModeId = modeId;
          botSend(sessionId, { type: 'mode.changed', currentModeId: modeId });
          break;
        }
        case 'usage_update': {
          if (state) {
            state.usageSize = update.size || 0;
            state.usageUsed = update.used || 0;
            state.usageCost = update.cost || null;
          }
          botSend(sessionId, {
            type: 'usage.update',
            size: update.size || 0,
            used: update.used || 0,
            cost: update.cost || null,
          });
          break;
        }
        default: if (type) console.log(`[Daemon] Unhandled: ${type}`);
      }
    },

    // ── File System (local) ──
    async readTextFile(params) {
      console.log(`[Daemon:fs] read ${params.path}`);
      const state = sessions.get(sessionId);
      const filePath = resolveSessionPath(state?.workingDirectory, params.path);
      let content = await readFile(filePath, 'utf-8');
      if (params.line != null || params.limit != null) { const lines = content.split('\n'); content = lines.slice((params.line ?? 1) - 1, params.limit ? (params.line ?? 1) - 1 + params.limit : lines.length).join('\n'); }
      return { content };
    },
    async writeTextFile(params) {
      console.log(`[Daemon:fs] write ${params.path} (${params.content?.length || 0} chars)`);
      const state = sessions.get(sessionId);
      const filePath = resolveSessionPath(state?.workingDirectory, params.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, params.content, 'utf-8');
      return {};
    },

    // ── Terminal (local) ──
    _terminals: new Map(), _termNextId: 1,
    async createTerminal(params) {
      const id = `term_${this._termNextId++}`;
      console.log(`[Daemon:term] create ${id}: ${params.command} ${(params.args || []).join(' ')}`);
      const state = sessions.get(sessionId);
      const cwd = resolveSessionPath(state?.workingDirectory, params.cwd || '.');
      const child = spawn(params.command, params.args || [], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; const limit = params.outputByteLimit ?? 1024 * 1024;
      child.stdout?.on('data', d => { output += d.toString(); if (output.length > limit) output = output.slice(-limit); });
      child.stderr?.on('data', d => { output += d.toString(); if (output.length > limit) output = output.slice(-limit); });
      const exitPromise = new Promise(r => { child.on('close', code => { const t = this._terminals.get(id); if (t) { t.exitCode = code; t.exited = true; } r(); }); child.on('error', () => r()); });
      this._terminals.set(id, { process: child, output: () => output, exitCode: null, exited: false, exitPromise });
      return { terminalId: id };
    },
    async terminalOutput(params) { const t = this._terminals.get(params.terminalId); return { output: t?.output() || '', truncated: false }; },
    async waitForTerminalExit(params) {
      const t = this._terminals.get(params.terminalId);
      if (t && !t.exited) await Promise.race([t.exitPromise, new Promise(r => setTimeout(r, params.timeout ?? 30000))]);
      const code = t?.exitCode ?? -1;
      console.log(`[Daemon:term] exit ${params.terminalId} → ${code}`);
      return { exitCode: code };
    },
    async killTerminal(params) { const t = this._terminals.get(params.terminalId); if (t) try { t.process.kill('SIGTERM'); } catch {} return {}; },
    async releaseTerminal(params) { this._terminals.delete(params.terminalId); return {}; },
  };
}

// ── Copilot SDK Event Binding ──

function createSdkPermissionHandler(sessionId) {
  return async (request) => {
    const state = sessions.get(sessionId);
    if (!state) return false;
    const requestId = randomUUID();
    await botSend(sessionId, { type: 'permission.request', requestId, ...request });
    return new Promise((resolve) => {
      state.pendingPermissions.set(requestId, {
        resolve: (approved) => resolve(approved),
        timestamp: Date.now(),
      });
      setTimeout(() => { if (state.pendingPermissions.has(requestId)) { state.pendingPermissions.delete(requestId); resolve(false); } }, 5 * 60 * 1000);
    });
  };
}

function bindCopilotSdkEvents(state) {
  const { copilotSession, sessionId } = state;

  copilotSession.on('assistant.turn_start', () => {
    if (state.isProcessing && state.pendingCount > 0) state.pendingCount -= 1;
  });

  copilotSession.on('assistant.message_delta', (event) => {
    sendDelta(sessionId, event.data.messageId, event.data.deltaContent);
  });

  copilotSession.on('assistant.message', (event) => {
    flushDelta(event.data.messageId);
    botSend(sessionId, { type: 'assistant.message', messageId: event.data.messageId, content: event.data.content });
  });

  copilotSession.on('assistant.reasoning_delta', (event) => {
    sendDelta(sessionId, `reasoning-${event.data.reasoningId}`, event.data.deltaContent, 'assistant.reasoning_delta', 'reasoningId', event.data.reasoningId);
  });

  copilotSession.on('assistant.reasoning', (event) => {
    flushDelta(`reasoning-${event.data.reasoningId}`);
    botSend(sessionId, { type: 'assistant.reasoning', reasoningId: event.data.reasoningId, content: event.data.content });
  });

  copilotSession.on('tool.execution_start', (event) => {
    state.toolInvocations.set(event.data.toolCallId, { name: event.data.toolName });
    botSend(sessionId, { type: 'tool.start', toolCallId: event.data.toolCallId, name: event.data.toolName, args: event.data.args });
  });

  copilotSession.on('tool.execution_complete', (event) => {
    const inv = state.toolInvocations.get(event.data.toolCallId);
    state.toolInvocations.delete(event.data.toolCallId);
    botSend(sessionId, { type: 'tool.complete', toolCallId: event.data.toolCallId, name: inv?.name || 'Tool', success: true, result: event.data.result || '', detailedResult: event.data.detailedResult || '' });
  });

  copilotSession.on('session.idle', () => {
    state.isProcessing = false;
    state.isStopping = false;
    state.pendingCount = 0;
    botSend(sessionId, { type: 'session.idle' });
    emitSessionState(sessionId);
  });

  copilotSession.on('session.error', (event) => {
    state.isProcessing = false;
    state.isStopping = false;
    state.pendingCount = 0;
    emitSessionState(sessionId);
    botSend(sessionId, { type: 'session.error', message: String(event.data) });
  });

  copilotSession.on('session.model_change', (event) => {
    state.model = event.data.newModel;
    state.currentModelId = event.data.newModel;
    updateSessionRecord(sessionId, { model: event.data.newModel });
    emitSessionState(sessionId);
    if (hasModelToolbarState(state)) emitModelsUpdate(sessionId, state);
  });

  copilotSession.on('session.mode_changed', (event) => {
    state.currentModeId = event.data.newMode;
    botSend(sessionId, { type: 'mode.changed', currentModeId: event.data.newMode });
  });

  copilotSession.on('session.usage_info', (event) => {
    state.usageSize = event.data.tokenLimit || 0;
    state.usageUsed = event.data.currentTokens || 0;
    state.usageCost = null;
    botSend(sessionId, {
      type: 'usage.update',
      size: state.usageSize,
      used: state.usageUsed,
      raw: event.data,
    });
  });
}

// ── Main ──

async function main() {
  if (INSTALL_ALL_AGENT_CLI_MODE) {
    await installAllSupportedAgentCli();
    return;
  }

  Object.assign(sessionStore, await loadSessionStore());

  console.log('[Daemon] Starting...');

  // Scan /workspace for available project directories
  let workspaces = [];
  try {
    workspaces = (await readdir('/workspace', { withFileTypes: true }))
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => `/workspace/${e.name}`);
  } catch {}
  // Also add cwd if it's not already in the list
  const cwd = process.cwd();
  if (cwd && !workspaces.includes(cwd)) workspaces.unshift(cwd);
  advertisedWorkspaces = workspaces;

  daemonPresenceInfo = {
    hostname: osHostname(),
    platform: process.platform,
    agents: [...Object.keys(ACP_AGENTS), 'copilot-sdk'],
    workspaces,
  };

  await ensureBotChatReady();

  const announceOffline = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await flushSessionStoreWrites(sessionStore);
    if (botReconnectTimer) {
      clearTimeout(botReconnectTimer);
      botReconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    try {
      if (daemonPresenceInfo) {
        await sendDaemonPresence('daemon.offline', daemonPresenceInfo);
      }
    } catch (e) {
      console.log(`[Daemon] Offline announce failed: ${e.message?.substring(0, 60)}`);
    }
    try { botChat?.stop(); } catch {}
    botChat = null;
  };

  const handleShutdown = (signal) => {
    void announceOffline().finally(() => process.exit(signal === 'SIGINT' ? 130 : 0));
  };

  process.once('SIGINT', () => handleShutdown('SIGINT'));
  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  try {
    await sendDaemonPresence('daemon.online', daemonPresenceInfo);
    console.log(`[Daemon] Registered with portal: ${daemonPresenceInfo.hostname} (${daemonPresenceInfo.agents.join(', ')})`);
  } catch (e) {
    console.log(`[Daemon] Portal registration refresh failed: ${e.message?.substring(0, 60)}`);
  }
  heartbeatTimer = setInterval(() => {
    void sendDaemonPresence('daemon.online', daemonPresenceInfo).catch((err) => {
      console.log(`[Daemon] Heartbeat failed: ${err.message?.substring(0, 60)}`);
    });
  }, DAEMON_HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  console.log('[Daemon] Ready. Waiting for messages from Web UI / CLI.');
}

main().catch(err => { console.error('[Daemon] Fatal:', err); process.exit(1); });
