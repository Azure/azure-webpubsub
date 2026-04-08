/**
 * Agent Daemon — runs on the user's machine.
 *
 * Responsibilities:
 * - Chat Bot: logs into Web PubSub Chat, listens for user messages
 * - ACP Agent: spawns code agents (Copilot, Claude, Gemini, etc.)
 * - Session Manager: creates sessions, maps events to Chat
 * - File System: reads/writes files on the local machine
 * - Terminal: executes commands on the local machine
 * - Permission: forwards permission requests to Chat, waits for user response
 *
 * The web-server.js only provides static files and /negotiate.
 * All agent logic lives here.
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, delimiter } from 'path';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { ChatClient } from '@azure/web-pubsub-chat-client';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { hostname as osHostname } from 'os';

// ── Configuration ──

const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING || process.env.WebPubSubConnectionString;
if (!connectionString) {
  console.error('[Daemon] Error: WEB_PUBSUB_CONNECTION_STRING or WebPubSubConnectionString is required');
  process.exit(1);
}

const hubName = process.env.WEB_PUBSUB_HUB || 'chat';
const BOT_USER_ID = process.env.DAEMON_USER_ID || 'copilot-bot';
const MAX_ROOM_MESSAGE_LENGTH = 4096;
const LOBBY_ROOM = 'lobby';
const DAEMON_HEARTBEAT_MS = 30000;
const DAEMON_DIR = dirname(fileURLToPath(import.meta.url));
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH
  || resolve(process.env.HOME || process.env.USERPROFILE || '.', '.copilot-mobile', 'sessions.json');

// ── ACP Agent Configs ──

const ACP_AGENTS = {
  'copilot': {
    command: 'npx',
    args: ['@github/copilot-language-server@latest', '--acp'],
    npxPackage: '@github/copilot-language-server@latest',
    npxArgs: ['--acp'],
    binName: 'copilot-language-server',
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
  'gemini': { command: 'npx', args: ['@google/gemini-cli@latest', '--experimental-acp'], displayName: 'Gemini CLI' },
  'codex': {
    command: 'npx',
    args: ['@zed-industries/codex-acp@latest'],
    npxPackage: '@zed-industries/codex-acp@latest',
    npxArgs: [],
    binName: 'codex-acp',
    binArgs: [],
    displayName: 'Codex CLI',
  },
  'opencode': { command: 'npx', args: ['opencode-ai@latest', 'acp'], displayName: 'OpenCode' },
};

// ── State ──

function loadSessionStore() {
  try {
    if (existsSync(SESSION_STORE_PATH)) {
      return JSON.parse(readFileSync(SESSION_STORE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Daemon] Failed to load session store:', err.message);
  }
  return {};
}

function saveSessionStore(store) {
  try {
    mkdirSync(dirname(SESSION_STORE_PATH), { recursive: true });
    writeFileSync(SESSION_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Daemon] Failed to save session store:', err.message);
  }
}

const sessions = new Map();
const sessionStore = loadSessionStore();
let botChat = null;
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
    isProcessing: false,
    pendingCount: 0,
    isResuming: false,
    availableModes: [],
    currentModeId: '',
    availableModels: [],
    currentModelId: '',
    availableCommands: [],
    pendingPermissions: new Map(),
    toolInvocations: new Map(),
  };
}

function persistSessionRecord(roomId, record) {
  sessionStore[roomId] = record;
  saveSessionStore(sessionStore);
}

function updateSessionRecord(roomId, patch) {
  if (!sessionStore[roomId]) return;
  sessionStore[roomId] = { ...sessionStore[roomId], ...patch };
  saveSessionStore(sessionStore);
}

function deleteSessionRecord(roomId) {
  if (!sessionStore[roomId]) return;
  delete sessionStore[roomId];
  saveSessionStore(sessionStore);
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
  botSend(sessionId, {
    type: 'models.update',
    models: state.availableModels || [],
    currentModelId: state.currentModelId || '',
  });
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
    if (state.currentModelId) state.model = state.currentModelId;
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
    if (state.availableModels.length) emitModelsUpdate(state.sessionId, state);
  } catch (err) {
    console.warn('[Daemon] Failed to list Copilot SDK models:', err.message);
  }
}

async function startSdkSession(roomId, state, { model, workingDirectory }) {
  const client = await ensureCopilotSdkClient();
  const selectedModel = model || 'gpt-5.4';
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
  if (!botChat) return;
  try {
    const payload = JSON.stringify(envelope);
    if (payload.length <= MAX_ROOM_MESSAGE_LENGTH) {
      await botChat.sendToRoom(roomId, payload);
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
      await botChat.sendToRoom(roomId, JSON.stringify({ type: 'transport.chunk', chunkId, index, total: parts.length, jsonPart: parts[index] }));
    }
  } catch (err) {
    console.error(`[Daemon] Failed to send to room ${roomId}:`, err.message);
  }
}

async function ensureRoomMembership(chatClient, roomId, roomName, userId) {
  try {
    await chatClient.createRoom(roomName, [userId], roomId);
    return;
  } catch {}
  try {
    await chatClient.addUserToRoom(roomId, userId);
  } catch {}
}

function listDirectoriesForPath(inputPath, workspaceRoots = []) {
  const home = process.env.HOME || process.cwd();
  const requested = String(inputPath || workspaceRoots[0] || process.cwd()).replace(/^~(?=$|[\\/])/, home);
  try {
    const base = resolve(requested);
    const dirs = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, path: resolve(base, entry.name) }))
      .slice(0, 50);
    return { base, dirs };
  } catch {
    const parent = resolve(requested, '..');
    try {
      const prefix = requested.split(/[\\/]/).pop()?.toLowerCase() || '';
      const dirs = readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name.toLowerCase().startsWith(prefix))
        .map((entry) => ({ name: entry.name, path: resolve(parent, entry.name) }))
        .slice(0, 50);
      return { base: parent, dirs, partial: prefix };
    } catch {
      return { base: resolve(requested), dirs: [] };
    }
  }
}

function resolveWorkingDirectoryOrThrow(inputPath) {
  const requested = String(inputPath || '').trim();
  const normalized = resolve(requested || process.cwd());
  try {
    readdirSync(normalized, { withFileTypes: true });
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
  if (!botChat) return;
  const payload = {
    type,
    daemonId: BOT_USER_ID,
    hostname: details.hostname,
    platform: details.platform,
    agents: details.agents,
    workspaces: details.workspaces,
    updatedAt: new Date().toISOString(),
  };
  await botChat.sendToRoom(LOBBY_ROOM, JSON.stringify(payload));
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

// ── Session Helpers ──

function emitSessionState(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) return;
  botSend(sessionId, { type: 'session.state', processing: state.isProcessing, pendingCount: state.pendingCount, model: state.model });
}

function deactivateSession(sessionId, message) {
  const state = sessions.get(sessionId);
  if (!state) return;
  state.active = false;
  state.isProcessing = false;
  state.pendingCount = 0;
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

async function sendSessionPrompt(state, roomId, prompt) {
  if (state.active === false) {
    botSend(roomId, { type: 'session.error', message: 'This agent session is no longer active. Create a new session.' });
    return;
  }
  // SDK mode
  if (state.copilotSession) {
    state.isProcessing = true;
    emitSessionState(roomId);
    try {
      await state.copilotSession.send({ prompt });
    } catch (err) {
      botSend(roomId, { type: 'session.error', message: err.message });
    }
    return;
  }
  // ACP mode
  if (!state.acpConnection) {
    botSend(roomId, { type: 'session.error', message: 'Agent is still starting… please wait.' });
    return;
  }
  state.isProcessing = true;
  emitSessionState(roomId);
  try {
    await state.acpConnection.prompt({ sessionId: state.acpSessionId, prompt: [{ type: 'text', text: prompt }] });
    flushCompletedToolInvocations(roomId);
    const client = state._acpClient;
    if (client) {
      if (client._currentMessageText) {
        const msgId = `acp-msg-${client._msgCounter++}`; flushDelta(msgId);
        botSend(roomId, { type: 'assistant.message', messageId: msgId, content: client._currentMessageText });
        client._currentMessageText = '';
      }
      if (client._currentThoughtText) {
        const rid = `acp-reason-${client._reasonCounter++}`; flushDelta(`reasoning-${rid}`);
        botSend(roomId, { type: 'assistant.reasoning', reasoningId: rid, content: client._currentThoughtText });
        client._currentThoughtText = '';
      }
    }
  } catch (err) {
    botSend(roomId, { type: 'session.error', message: err.message });
  }
  state.isProcessing = false;
  state.pendingCount = 0;
  botSend(roomId, { type: 'session.idle' });
  emitSessionState(roomId);
}

// ── ACP Session Creation ──

async function createAcpSession(sessionId, agentName, workingDirectory) {
  const config = ACP_AGENTS[agentName];
  if (!config) throw new Error(`Unknown ACP agent: ${agentName}`);
  const launch = resolveAcpLaunch(config);

  console.log(`[Daemon] Spawning ${agentName}: ${launch.command} ${(launch.args || []).join(' ')} [${launch.source}]`);

  const child = spawn(launch.command, launch.args || [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(config.env || {}) },
    shell: true,
  });
  child.stderr?.on('data', (data) => { const line = data.toString().trim(); if (line) console.log(`[Daemon:${agentName}] ${line}`); });

  const readable = Readable.toWeb(child.stdout);
  const writable = Writable.toWeb(child.stdin);
  const stream = ndJsonStream(writable, readable);
  const client = createAcpClient(sessionId);
  const connection = new ClientSideConnection((agent) => { client._agent = agent; return client; }, stream);

  const initResponse = await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: 'codeagenthub-daemon', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  });
  console.log(`[Daemon] Initialized: ${initResponse.agentInfo?.name || agentName} v${initResponse.agentInfo?.version || '?'}`);

  const sessionResponse = await (async () => {
    try {
      return await connection.newSession({ cwd: workingDirectory, mcpServers: [] });
    } catch (e) {
      const authMessage = [e?.message, e?.data?.details, e?.data?.message].filter(Boolean).join(' | ');
      const authRequired = e?.code === -32000 || /auth.?required/i.test(authMessage);
      if (!authRequired) throw e;
      const authMethods = initResponse.authMethods;
      if (!authMethods?.length) throw new Error(`Agent "${agentName}" requires auth but advertised no methods`);
      console.log(`[Daemon] Auth required. Using: ${authMethods[0].name}`);
      await connection.authenticate({ methodId: authMethods[0].id });
      console.log(`[Daemon] Auth successful`);
      return await connection.newSession({ cwd: workingDirectory, mcpServers: [] });
    }
  })();
  console.log(`[Daemon] ACP session: ${sessionResponse.sessionId}`);

  child.on('close', (code) => {
    console.log(`[Daemon:${agentName}] Exited (code=${code})`);
    deactivateSession(sessionId, `Agent exited (code=${code})`);
  });

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

  const child = spawn(launch.command, launch.args || [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(config.env || {}) },
    shell: true,
  });
  child.stderr?.on('data', (data) => { const line = data.toString().trim(); if (line) console.log(`[Daemon:${agentName}] ${line}`); });

  const readable = Readable.toWeb(child.stdout);
  const writable = Writable.toWeb(child.stdin);
  const stream = ndJsonStream(writable, readable);
  const client = createAcpClient(sessionId);
  const connection = new ClientSideConnection((agent) => { client._agent = agent; return client; }, stream);

  const initResponse = await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: 'codeagenthub-daemon', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  });

  const loadResponse = await (async () => {
    try {
      return await connection.loadSession({ sessionId: acpSessionId, cwd: workingDirectory, mcpServers: [] });
    } catch (e) {
      const authMessage = [e?.message, e?.data?.details, e?.data?.message].filter(Boolean).join(' | ');
      const authRequired = e?.code === -32000 || /auth.?required/i.test(authMessage);
      if (!authRequired) throw e;
      const authMethods = initResponse.authMethods;
      if (!authMethods?.length) throw new Error(`Agent "${agentName}" requires auth but advertised no methods`);
      console.log(`[Daemon] Auth required for resume. Using: ${authMethods[0].name}`);
      await connection.authenticate({ methodId: authMethods[0].id });
      return await connection.loadSession({ sessionId: acpSessionId, cwd: workingDirectory, mcpServers: [] });
    }
  })();

  child.on('close', (code) => {
    console.log(`[Daemon:${agentName}] Exited (code=${code})`);
    deactivateSession(sessionId, `Agent exited (code=${code})`);
  });

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
    model: savedInfo.model || 'gpt-5.4',
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
  let state = sessions.get(roomId);
  const shouldTryResume = (!state || state.active === false)
    && (envelope.type === 'user.prompt' || envelope.type === 'user.command');
  if (!shouldTryResume) return state;

  const saved = sessionStore[roomId];
  if (!saved?.supportsResume) return state;

  console.log(`[Daemon] Auto-resuming session for room ${roomId} (${saved.agentName})`);
  await botSend(roomId, { type: 'system.info', message: 'Resuming session…' });

  try {
    if (state?.active === false) sessions.delete(roomId);

    if (saved.agentName === 'copilot-sdk') {
      state = createSessionState({
        sessionId: roomId,
        agentName: 'copilot-sdk',
        workingDirectory: saved.cwd || process.cwd(),
        model: saved.model || 'gpt-5.4',
      });
      sessions.set(roomId, state);
      state.copilotSession = await resumeSdkSession(roomId, saved);
      state.active = true;
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
        model: saved.model || 'gpt-5.4',
      });
      sessions.set(roomId, state);
      await startSdkSession(roomId, state, {
        model: saved.model || 'gpt-5.4',
        workingDirectory: saved.cwd || process.cwd(),
      });
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
          const state = sessions.get(sessionId);
          const tcId = update.toolCallId || randomUUID();
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
      const filePath = resolve(params.path);
      let content = readFileSync(filePath, 'utf-8');
      if (params.line != null || params.limit != null) { const lines = content.split('\n'); content = lines.slice((params.line ?? 1) - 1, params.limit ? (params.line ?? 1) - 1 + params.limit : lines.length).join('\n'); }
      return { content };
    },
    async writeTextFile(params) {
      console.log(`[Daemon:fs] write ${params.path} (${params.content?.length || 0} chars)`);
      mkdirSync(dirname(resolve(params.path)), { recursive: true });
      writeFileSync(resolve(params.path), params.content, 'utf-8');
      return {};
    },

    // ── Terminal (local) ──
    _terminals: new Map(), _termNextId: 1,
    async createTerminal(params) {
      const id = `term_${this._termNextId++}`;
      console.log(`[Daemon:term] create ${id}: ${params.command} ${(params.args || []).join(' ')}`);
      const child = spawn(params.command, params.args || [], { cwd: params.cwd || process.cwd(), shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
    state.pendingCount = 0;
    botSend(sessionId, { type: 'session.idle' });
    emitSessionState(sessionId);
  });

  copilotSession.on('session.error', (event) => {
    state.isProcessing = false;
    state.pendingCount = 0;
    emitSessionState(sessionId);
    botSend(sessionId, { type: 'session.error', message: String(event.data) });
  });

  copilotSession.on('session.model_change', (event) => {
    state.model = event.data.newModel;
    state.currentModelId = event.data.newModel;
    updateSessionRecord(sessionId, { model: event.data.newModel });
    emitSessionState(sessionId);
    if (state.availableModels.length) emitModelsUpdate(sessionId, state);
  });

  copilotSession.on('session.mode_changed', (event) => {
    state.currentModeId = event.data.newMode;
    botSend(sessionId, { type: 'mode.changed', currentModeId: event.data.newMode });
  });

  copilotSession.on('session.usage_info', (event) => {
    botSend(sessionId, {
      type: 'usage.update',
      size: event.data.tokenLimit || 0,
      used: event.data.currentTokens || 0,
      raw: event.data,
    });
  });
}

// ── Main ──

async function main() {
  console.log('[Daemon] Starting...');
  let shuttingDown = false;

  const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
  let tokenUrl;
  try {
    // Try to get token via web portal (admin will add us to lobby)
    const resp = await fetch(`${portalUrl}/negotiate?userId=${encodeURIComponent(BOT_USER_ID)}`);
    const body = await resp.json();
    tokenUrl = body.url;
    console.log(`[Daemon] Got token via portal negotiate`);
  } catch {
    // Fallback: direct token from service client
    console.log(`[Daemon] Portal not reachable, using direct token`);
    const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });
    const tokenResponse = await serviceClient.getClientAccessToken({ userId: BOT_USER_ID });
    tokenUrl = tokenResponse.url;
  }
  botChat = await new ChatClient(tokenUrl).login();
  console.log(`[Daemon] Bot logged in as: ${botChat.userId}`);

  // ── Join lobby and announce ──
  await ensureRoomMembership(botChat, LOBBY_ROOM, 'Agent Lobby', BOT_USER_ID);
  // Scan /workspace for available project directories
  let workspaces = [];
  try {
    workspaces = readdirSync('/workspace', { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => `/workspace/${e.name}`);
  } catch {}
  // Also add cwd if it's not already in the list
  const cwd = process.cwd();
  if (cwd && !workspaces.includes(cwd)) workspaces.unshift(cwd);

  const daemonInfo = {
    hostname: osHostname(),
    platform: process.platform,
    agents: [...Object.keys(ACP_AGENTS), 'copilot-sdk'],
    workspaces,
  };

  let heartbeatTimer = null;
  const announceOffline = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    try {
      await sendDaemonPresence('daemon.offline', daemonInfo);
    } catch (e) {
      console.log(`[Daemon] Offline announce failed: ${e.message?.substring(0, 60)}`);
    }
    try { botChat?.stop(); } catch {}
  };

  const handleShutdown = (signal) => {
    void announceOffline().finally(() => process.exit(signal === 'SIGINT' ? 130 : 0));
  };

  process.once('SIGINT', () => handleShutdown('SIGINT'));
  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  try {
    await sendDaemonPresence('daemon.online', daemonInfo);
    console.log(`[Daemon] Announced in lobby: ${daemonInfo.hostname} (${daemonInfo.agents.join(', ')})`);
  } catch (e) {
    console.log(`[Daemon] Lobby announce failed, retrying in 2s...`);
    await new Promise(r => setTimeout(r, 2000));
    try {
      await sendDaemonPresence('daemon.online', daemonInfo);
      console.log(`[Daemon] Announced in lobby (retry): ${daemonInfo.hostname}`);
    } catch (e2) {
      console.log(`[Daemon] Lobby announce failed: ${e2.message?.substring(0, 60)}`);
    }
  }
  heartbeatTimer = setInterval(() => {
    void sendDaemonPresence('daemon.online', daemonInfo).catch((err) => {
      console.log(`[Daemon] Heartbeat failed: ${err.message?.substring(0, 60)}`);
    });
  }, DAEMON_HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  botChat.addListenerForNewMessage(async (notification) => {
    try {
      const msg = notification.message;
      const roomId = notification.conversation?.roomId;
      if (msg.createdBy === BOT_USER_ID || !roomId || !msg.content?.text) return;

      let envelope;
      try { envelope = JSON.parse(msg.content.text); } catch { return; }

      if (roomId === LOBBY_ROOM) {
        if (envelope.type === 'workspace.list_request' && envelope.daemonId === BOT_USER_ID && envelope.requestId && envelope.requesterUserId) {
          const result = listDirectoriesForPath(envelope.path, workspaces);
          await botSend(LOBBY_ROOM, {
            type: 'workspace.list_response',
            requestId: envelope.requestId,
            requesterUserId: envelope.requesterUserId,
            daemonId: BOT_USER_ID,
            ...result,
          });
        }
        return;
      }

      // ── Control: create session ──
      if (envelope.type === 'control.create') {
        const { userId, agentName, workingDirectory, initialPrompt, model } = envelope;
        console.log(`[Daemon] control.create: agent=${agentName} dir=${workingDirectory}`);
        let selectedWorkingDirectory;
        try {
          selectedWorkingDirectory = resolveWorkingDirectoryOrThrow(workingDirectory);
        } catch (err) {
          await botSend(roomId, { type: 'session.error', message: err.message });
          return;
        }
        const state = createSessionState({
          sessionId: roomId,
          agentName,
          firstPrompt: initialPrompt || '',
          ownerUserId: userId,
          workingDirectory: selectedWorkingDirectory,
          model: model || (agentName === 'copilot-sdk' ? 'gpt-5.4' : 'default'),
        });
        sessions.set(roomId, state);

        if (agentName === 'copilot-sdk') {
          // ── Copilot SDK mode ──
          await botSend(roomId, { type: 'system.info', message: 'Starting GitHub Copilot (SDK)…' });
          try {
            await startSdkSession(roomId, state, { model, workingDirectory: selectedWorkingDirectory });
            await botSend(roomId, { type: 'system.info', message: 'Connected to GitHub Copilot (SDK)' });
            emitSessionState(roomId);
            if (initialPrompt) {
              await sendSessionPrompt(state, roomId, initialPrompt);
            }
          } catch (err) {
            console.error('[Daemon] Copilot SDK failed:', err.message);
            deactivateSession(roomId, `Failed to start: ${err.message}`);
          }
        } else {
          // ── ACP mode ──
          await botSend(roomId, { type: 'system.info', message: `Starting ${ACP_AGENTS[agentName]?.displayName || agentName}…` });
          try {
            const acp = await createAcpSession(roomId, agentName, selectedWorkingDirectory);
            Object.assign(state, { acpConnection: acp.connection, acpSessionId: acp.acpSessionId, acpProcess: acp.process, _acpClient: acp.client, active: true });
            handleSessionCapabilities(state, roomId, acp.sessionResponse);
            persistSessionRecord(roomId, {
              agentName,
              acpSessionId: acp.acpSessionId,
              cwd: selectedWorkingDirectory,
              supportsResume: acp.initResponse.agentCapabilities?.loadSession ?? false,
            });
            await botSend(roomId, { type: 'system.info', message: `Connected to ${acp.displayName}` });
            emitSessionState(roomId);
            if (initialPrompt) await sendSessionPrompt(state, roomId, initialPrompt);
          } catch (err) {
            console.error(`[Daemon] Spawn failed:`, err.message);
            deactivateSession(roomId, `Failed to start: ${err.message}`);
          }
        }
        return;
      }

      // ── Control: delete session ──
      if (envelope.type === 'control.delete') {
        const state = sessions.get(roomId);
        if (state?.acpProcess) try { state.acpProcess.kill('SIGTERM'); } catch {}
        if (state?.copilotSession) try { await state.copilotSession.abort(); } catch {}
        sessions.delete(roomId);
        deleteSessionRecord(roomId);
        console.log(`[Daemon] Session deleted: ${roomId}`);
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
            const p = state.pendingPermissions.get(envelope.requestId);
            if (p) { console.log(`[Daemon] Permission ${envelope.approved ? '✓' : '✕'}: ${envelope.requestId.substring(0, 8)}`); p.resolve(!!envelope.approved); state.pendingPermissions.delete(envelope.requestId); }
          }
          break;
      }
    } catch (err) {
      console.error('[Daemon] Error:', err);
    }
  });

  console.log('[Daemon] Ready. Waiting for messages from Web UI / CLI.');
}

main().catch(err => { console.error('[Daemon] Fatal:', err); process.exit(1); });
