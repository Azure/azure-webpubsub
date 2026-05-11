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
 * The web-portal/web-server.js only provides static files and /negotiate.
 * All agent logic lives here.
 */

import { randomUUID } from 'crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, resolve, delimiter, relative, isAbsolute } from 'path';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Readable, Writable } from 'node:stream';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { hostname as osHostname } from 'os';
import { config as loadEnv } from 'dotenv';
import { buildDelegationContextPrompt, upsertDelegationContextEntries } from './delegation-context.js';
import { beginActiveDelegationSettlement } from './delegation-state.js';
import { createModelsUpdateEvent, hasModelToolbarState } from '../shared/session-toolbar-state.js';
import { daemonAclRoomId } from '../shared/daemon-acl.js';
import { shouldTryAutoResumeSession } from './session-resume-policy.js';
import { listDirectoriesForPath, resolveWorkingDirectoryOrThrow } from './workspace-browse.js';
import { createSessionStore } from './session-store.js';
import { createBotChat } from './bot-chat.js';
import {
  DELEGATION_CONTROL_ROOM_ID,
  buildDelegationControlEnvelope,
  buildDelegationRelayEnvelope,
  isDelegationTerminalStatus,
  parseDelegationSummaryEnvelope,
  parseDelegationTargetControlEnvelope,
} from '../shared/session-delegation.js';
import { rootLogger, summarizePathForLog } from '../shared/logging.js';

// ── Configuration ──

loadEnv({ quiet: true });

const daemonLogger = rootLogger.child({ component: 'daemon' });
const installLogger = daemonLogger.child({ area: 'install' });
const sessionStoreLogger = daemonLogger.child({ area: 'session-store' });
const sdkLogger = daemonLogger.child({ area: 'sdk' });
const botLogger = daemonLogger.child({ area: 'bot' });
const delegationLogger = daemonLogger.child({ area: 'delegation' });

const DAEMON_ENTRY_DIR = process.argv[1]
  ? dirname(resolve(process.argv[1]))
  : process.cwd();

const INSTALL_ALL_AGENT_CLI_MODE = process.argv.includes('--install');
const portalUrl = process.env.PORTAL_URL || 'http://localhost:3000';
let BOT_USER_ID = '';
let BOT_OWNER_USER_ID = '';
const PORTAL_CONTROL_USER_ID = process.env.PORTAL_CONTROL_USER_ID || '__portal_control__';
const MAX_ROOM_MESSAGE_LENGTH = 4096;
const LOBBY_ROOM = 'lobby';
let DAEMON_CONTROL_ROOM = '';
const DAEMON_HEARTBEAT_MS = 30000;
const DAEMON_DIR = DAEMON_ENTRY_DIR;
const PROJECT_ROOT = [
  resolve(DAEMON_DIR, '..'),
  resolve(DAEMON_DIR, '..', '..'),
].find((candidate) => existsSync(resolve(candidate, 'package.json')))
  || resolve(DAEMON_DIR, '..');
const SESSION_STORE_PATH = process.env.SESSION_STORE_PATH
  || resolve(process.env.HOME || process.env.USERPROFILE || '.', '.copilot-mobile', 'sessions.json');
const DEFAULT_SDK_MODEL = 'gpt-5.4';
const ACP_STARTUP_TIMEOUT_MS = Number(process.env.ACP_STARTUP_TIMEOUT_MS || 90000);
const SUPPORTED_ACP_AGENT_NAMES = ['copilot', 'claude', 'codex'];

function sanitizeDaemonIdFragment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function promptForRequiredValue(rl, message, { defaultValue = '', sanitize = (value) => value } = {}) {
  while (true) {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${message}${suffix}: `)).trim();
    const resolved = sanitize(answer || defaultValue);
    if (resolved) return resolved;
  }
}

async function ensureStartupIdentity() {
  let ownerUserId = String(process.env.DAEMON_OWNER_USER_ID || process.env.DAEMON_OWNER || '').trim();
  let daemonInstanceId = String(process.env.DAEMON_INSTANCE_ID || '').trim();

  if (!ownerUserId && (!input.isTTY || !output.isTTY)) {
    throw new Error('DAEMON_OWNER_USER_ID is required when running without an interactive terminal.');
  }

  let rl = null;
  try {
    if (!ownerUserId || !daemonInstanceId) {
      rl = createInterface({ input, output });
    }

    if (!ownerUserId) {
      ownerUserId = await promptForRequiredValue(rl, 'Enter your GitHub username');
    }

    if (!daemonInstanceId) {
      const hostnamePart = sanitizeDaemonIdFragment(osHostname()) || 'daemon';
      const ownerPart = sanitizeDaemonIdFragment(ownerUserId) || 'user';
      const defaultInstanceId = `${hostnamePart}-${ownerPart}`;
      daemonInstanceId = await promptForRequiredValue(rl, 'Enter daemon instance id (Enter for default value)', {
        defaultValue: defaultInstanceId,
        sanitize: sanitizeDaemonIdFragment,
      });
    }
  } finally {
    rl?.close();
  }

  BOT_OWNER_USER_ID = ownerUserId;
  BOT_USER_ID = daemonInstanceId;
  DAEMON_CONTROL_ROOM = BOT_USER_ID;
  process.env.DAEMON_OWNER_USER_ID = BOT_OWNER_USER_ID;
  process.env.DAEMON_INSTANCE_ID = BOT_USER_ID;
}

function isPortalControlUser(userId) {
  return String(userId || '').trim() === PORTAL_CONTROL_USER_ID;
}

async function bootstrapDaemonSessionToken() {
  const endpoint = `${portalUrl}/api/daemon-sessions/bootstrap`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      daemonId: BOT_USER_ID,
      ownerUserId: BOT_OWNER_USER_ID,
    }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.error || `Daemon bootstrap failed (${resp.status})`);
  }
  if (!body?.token) {
    throw new Error('Portal bootstrap did not return a daemon session token');
  }
  return body.token;
}

async function postDaemonJson(path, body = {}) {
  const token = await bootstrapDaemonSessionToken();
  const endpoint = `${portalUrl}${path}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(responseBody?.error || `Portal request failed (${resp.status})`);
  }
  return responseBody;
}

async function postDaemonPortal(path, details = {}) {
  return await postDaemonJson(path, {
    hostname: details.hostname,
    platform: details.platform,
    agents: details.agents,
    workspaces: details.workspaces,
  });
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
    installLogger.info('agent-cli.install.started', {
      agentName,
      packageName: config.npxPackage,
    }, 'Installing ACP agent CLI');
    await runCommandOrThrow('npm', ['install', '-g', config.npxPackage]);
  }
  installLogger.info('agent-cli.install.completed', {
    agentCount: SUPPORTED_ACP_AGENT_NAMES.length,
  }, 'All supported ACP agent CLIs are installed');
}

// ── State ──

const sessionStore = createSessionStore({
  filePath: SESSION_STORE_PATH,
  logger: sessionStoreLogger,
});

const sessions = new Map();
const resumePromises = new Map();
let botChatHandle = null;
let heartbeatTimer = null;
let advertisedWorkspaces = [];
let daemonPresenceInfo = null;
let shuttingDown = false;
let copilotSdkClient = null; // shared CopilotClient instance for SDK mode

function getSessionLogger(sessionId, state = sessions.get(sessionId)) {
  return daemonLogger.child({
    agentName: state?.agentName,
    sessionId,
  });
}

/**
 * Per-room session state. The fields are mutated directly throughout the
 * daemon (sessions.get(roomId).foo = ...) — this class only owns shape +
 * defaults. There is intentionally no encapsulation layer over field
 * writes; mutations happen in the small set of places that need them
 * (cancelSessionTurn, sendSessionPrompt, createAcpClient, etc.).
 */
class SessionState {
  constructor({ sessionId, agentName, firstPrompt = '', ownerUserId = null, workingDirectory = process.cwd(), model = 'default', delegationContextEntries = [] }) {
    this.sessionId = sessionId;
    this.agentName = agentName;
    this.firstPrompt = firstPrompt;
    this.acpConnection = null;
    this.acpProcess = null;
    this.acpSessionId = null;
    this._acpClient = null;
    this._acpBuffers = null;
    this.copilotSession = null;
    this.ownerUserId = ownerUserId;
    this.workingDirectory = workingDirectory;
    this.model = model;
    this.active = false;
    this.isReady = false;
    this.isProcessing = false;
    this.isStopping = false;
    this.startupPromise = null;
    this.pendingCount = 0;
    this.isResuming = false;
    this.availableModes = [];
    this.currentModeId = '';
    this.availableModels = [];
    this.currentModelId = '';
    this.availableCommands = [];
    this.usageSize = 0;
    this.usageUsed = 0;
    this.usageCost = null;
    this.lastAssistantMessageContent = '';
    this.lastReasoningContent = '';
    this.delegationContextEntries = Array.isArray(delegationContextEntries) ? [...delegationContextEntries] : [];
    this.activeDelegation = null;
    this.pendingPermissions = new Map();
    this.toolInvocations = new Map();
  }
}

function createSessionState(options) {
  return new SessionState(options);
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
  cleanupClientTerminals(state._acpClient);
  if (state.acpProcess) {
    try { state.acpProcess.kill('SIGTERM'); } catch {}
  }
  if (state.copilotSession?.abort) {
    try { await state.copilotSession.abort(); } catch {}
  }
}

function persistSessionRecord(roomId, record) {
  sessionStore.persist(roomId, record);
}

function updateSessionRecord(roomId, patch) {
  sessionStore.update(roomId, patch);
}

function rememberDelegationContext(roomId, envelope) {
  const state = sessions.get(roomId) || null;
  const saved = sessionStore.get(roomId);
  const savedEntries = Array.isArray(saved?.delegationContextEntries)
    ? saved.delegationContextEntries
    : [];
  const currentEntries = state?.delegationContextEntries?.length
    ? state.delegationContextEntries
    : savedEntries;
  const nextEntries = upsertDelegationContextEntries(currentEntries, envelope);
  if (state) {
    state.delegationContextEntries = nextEntries;
  }
  if (saved) {
    updateSessionRecord(roomId, { delegationContextEntries: nextEntries });
  }
}

function deleteSessionRecord(roomId) {
  sessionStore.delete(roomId);
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

// Seed mode/model toolbar state from an ACP newSession / loadSession response.
// ACP's NewSessionResponse can include `modes: { availableModes, currentModeId }`
// and `models: { availableModels, currentModelId }` — without seeding these,
// the toolbar is empty until the agent emits a *_update notification (which
// many agents only do on user-driven changes, never on initial state).
function seedAcpSessionToolbarState(state, sessionResponse) {
  if (!state || !sessionResponse) return;
  if (sessionResponse.modes) {
    if (Array.isArray(sessionResponse.modes.availableModes)) {
      state.availableModes = sessionResponse.modes.availableModes;
    }
    if (sessionResponse.modes.currentModeId) {
      state.currentModeId = sessionResponse.modes.currentModeId;
    }
  }
  if (sessionResponse.models) {
    if (Array.isArray(sessionResponse.models.availableModels)) {
      state.availableModels = sessionResponse.models.availableModels.map((model) => ({
        modelId: model.modelId || model.id,
        name: model.name || model.modelId || model.id,
        description: model.description || '',
      }));
    }
    if (sessionResponse.models.currentModelId) {
      state.currentModelId = sessionResponse.models.currentModelId;
    }
  }
}

function emitUsageUpdate(sessionId, state) {
  botSend(sessionId, {
    type: 'usage.update',
    size: state.usageSize || 0,
    used: state.usageUsed || 0,
    cost: state.usageCost || null,
  });
}

async function syncSessionUiState(sessionId, state) {
  if (!state) return;
  // For SDK sessions, refresh the model list from the SDK client if stale
  if (state.copilotSession && !(state.availableModels?.length)) {
    await refreshSdkModels(state);
  }
  await emitSessionState(sessionId, { broadcastStatus: false });
  if ((state.availableCommands || []).length) emitCommandsUpdate(sessionId, state.availableCommands);
  if ((state.availableModes || []).length || state.currentModeId) emitModesUpdate(sessionId, state);
  if (hasModelToolbarState(state)) emitModelsUpdate(sessionId, state);
  if ((state.usageSize || 0) > 0 || (state.usageUsed || 0) > 0) emitUsageUpdate(sessionId, state);
}

async function ensureCopilotSdkClient() {
  if (!copilotSdkClient) {
    const { CopilotClient } = await import('@github/copilot-sdk');
    copilotSdkClient = new CopilotClient();
    await copilotSdkClient.start();
    sdkLogger.info('sdk.client.started', {}, 'Copilot SDK client started');
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
    sdkLogger.warn('sdk.models.list.failed', {
      sessionId: state.sessionId,
      agentName: state.agentName,
      error: err,
    }, 'Failed to list Copilot SDK models');
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
    delegationContextEntries: state.delegationContextEntries,
  });
  return state;
}

// ── Chat Bot Send ──

function getActiveDelegation(roomId) {
  return sessions.get(roomId)?.activeDelegation || null;
}

function relayStreamTypeForEnvelope(envelope) {
  const type = String(envelope?.type || '').trim();
  if (type === 'assistant.delta') return 'assistant.message_delta';
  if (type === 'assistant.message') return 'assistant.message';
  if (type === 'assistant.reasoning_delta') return 'assistant.reasoning_delta';
  if (type === 'assistant.reasoning') return 'assistant.reasoning';
  if (type === 'tool.start') return 'tool.start';
  if (type === 'tool.complete') return 'tool.complete';
  if (type === 'session.state') return 'session.state';
  if (type === 'usage.update') return 'usage.update';
  return '';
}

function buildDelegationSummaryFromState(state) {
  return {
    finalContent: String(state?.lastAssistantMessageContent || '').trim(),
    model: String(state?.currentModelId || state?.model || '').trim(),
    usage: {
      used: Number.isFinite(Number(state?.usageUsed)) ? Number(state.usageUsed) : undefined,
      size: Number.isFinite(Number(state?.usageSize)) ? Number(state.usageSize) : undefined,
    },
  };
}

async function emitDelegationRelayEvent(delegation, streamType, payload = {}) {
  if (!delegation?.relayRoomId || !delegation.delegationId || !streamType) return;
  delegation.seq = Number(delegation.seq || 0) + 1;
  await botSend(delegation.relayRoomId, buildDelegationRelayEnvelope({
    delegationId: delegation.delegationId,
    relayRoomId: delegation.relayRoomId,
    seq: delegation.seq,
    sourceSessionId: delegation.sourceSessionId,
    targetSessionId: delegation.targetSessionId,
    targetDaemonId: delegation.targetDaemonId,
    streamType,
    payload,
    sentAt: new Date().toISOString(),
  }), { skipDelegationRelay: true });
}

async function settleActiveDelegation(state, roomId, status, { errorMessage = '' } = {}) {
  const delegation = beginActiveDelegationSettlement(state, status);
  if (!delegation) return;

  const summary = buildDelegationSummaryFromState(state);
  const streamType = status === 'completed'
    ? 'terminal.completed'
    : status === 'failed'
      ? 'terminal.failed'
      : status === 'cancelled'
        ? 'terminal.cancelled'
        : '';

  if (streamType) {
    await emitDelegationRelayEvent(delegation, streamType, {
      status,
      errorMessage: String(errorMessage || '').trim(),
      summary,
    });
  }

  try {
    await postDaemonJson(`/api/delegations/${encodeURIComponent(delegation.delegationId)}/settle`, {
      status,
      errorMessage: String(errorMessage || '').trim(),
      summary,
    });
  } catch (error) {
    delegationLogger.warn('delegation.settle.failed', {
      delegationId: delegation.delegationId,
      terminalStatus: status,
      error,
    }, 'Failed to settle delegation');
  }
}

async function failDelegationRequest(requestEnvelope, message) {
  const delegation = {
    delegationId: requestEnvelope.delegationId,
    sourceSessionId: requestEnvelope.sourceSessionId,
    targetSessionId: requestEnvelope.targetSessionId,
    relayRoomId: requestEnvelope.relayRoomId,
    targetDaemonId: requestEnvelope.targetDaemonId,
    requesterUserId: requestEnvelope.requesterUserId,
    seq: Number(requestEnvelope.resumeFromSeq || 0),
    settled: false,
  };
  const chat = await ensureBotChatReady();
  if (chat) {
    await botChatHandle.ensureRoomMembership(requestEnvelope.relayRoomId, 'Delegation Relay', BOT_USER_ID, [PORTAL_CONTROL_USER_ID]);
  }
  await emitDelegationRelayEvent(delegation, 'stream.open', {
    prompt: requestEnvelope.prompt,
    displayText: requestEnvelope.displayText,
  });
  delegation.settled = false;
  await emitDelegationRelayEvent(delegation, 'terminal.failed', {
    status: 'failed',
    errorMessage: String(message || 'Delegation failed'),
    summary: {
      finalContent: '',
      model: '',
      usage: undefined,
    },
  });
  try {
    await postDaemonJson(`/api/delegations/${encodeURIComponent(requestEnvelope.delegationId)}/settle`, {
      status: 'failed',
      errorMessage: String(message || 'Delegation failed'),
      summary: {
        finalContent: '',
        model: '',
        usage: undefined,
      },
    });
  } catch (error) {
    delegationLogger.warn('delegation.reject-settle.failed', {
      delegationId: requestEnvelope.delegationId,
      error,
    }, 'Failed to settle rejected delegation');
  }
}

async function startDelegationForSession(state, roomId, requestEnvelope) {
  const chat = await ensureBotChatReady();
  if (!chat) throw new Error('Chat client is unavailable');
  await botChatHandle.ensureRoomMembership(requestEnvelope.relayRoomId, 'Delegation Relay', BOT_USER_ID, [PORTAL_CONTROL_USER_ID]);
  await botChatHandle.ensureRoomMembership(DELEGATION_CONTROL_ROOM_ID, 'Delegation Control', BOT_USER_ID, [PORTAL_CONTROL_USER_ID]);

  const delegation = {
    delegationId: requestEnvelope.delegationId,
    sourceSessionId: requestEnvelope.sourceSessionId,
    targetSessionId: requestEnvelope.targetSessionId,
    relayRoomId: requestEnvelope.relayRoomId,
    targetDaemonId: requestEnvelope.targetDaemonId,
    requesterUserId: requestEnvelope.requesterUserId,
    prompt: requestEnvelope.prompt,
    displayText: requestEnvelope.displayText,
    seq: Number(requestEnvelope.resumeFromSeq || 0),
    settled: false,
    terminalStatus: '',
  };
  state.activeDelegation = delegation;

  await botSend(DELEGATION_CONTROL_ROOM_ID, buildDelegationControlEnvelope({
    type: 'control.delegation.started',
    delegationId: delegation.delegationId,
    sourceSessionId: delegation.sourceSessionId,
    targetSessionId: delegation.targetSessionId,
    relayRoomId: delegation.relayRoomId,
    requesterUserId: delegation.requesterUserId,
    targetDaemonId: delegation.targetDaemonId,
    createdAt: new Date().toISOString(),
    data: {
      prompt: delegation.prompt,
      displayText: delegation.displayText,
    },
  }), { skipDelegationRelay: true });

  await emitDelegationRelayEvent(delegation, 'stream.open', {
    prompt: delegation.prompt,
    displayText: delegation.displayText,
  });
}

async function botSend(roomId, envelope, { skipDelegationRelay = false } = {}) {
  const state = sessions.get(roomId);
  if (state && envelope?.type === 'assistant.message') {
    state.lastAssistantMessageContent = String(envelope.content || '');
  }
  if (state && envelope?.type === 'assistant.reasoning') {
    state.lastReasoningContent = String(envelope.content || '');
  }
  try {
    await botChatHandle.sendEnvelope(roomId, envelope);

    if (!skipDelegationRelay) {
      const delegation = getActiveDelegation(roomId);
      const streamType = relayStreamTypeForEnvelope(envelope);
      if (delegation && streamType) {
        await emitDelegationRelayEvent(delegation, streamType, envelope);
      }
    }
  } catch (err) {
    daemonLogger.error('chat.room.send.failed', {
      envelopeType: envelope?.type,
      error: err,
      roomId,
    }, 'Failed to send message to chat room');
  }
}

const sendDelta = (...args) => botChatHandle.sendDelta(...args);
const flushDelta = (key) => botChatHandle.flushDelta(key);

async function ensureBotChatReady() {
  return botChatHandle.ensureReady();
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
    const path = botChatHandle.isConnected() ? '/api/daemons/heartbeat' : '/api/daemons/register';
    await postDaemonPortal(path, details);
  }
}

async function fetchBotTokenUrl() {
  const body = await postDaemonPortal('/api/daemons/register', daemonPresenceInfo || {});
  if (!body?.url) {
    throw new Error('Portal daemon registration did not return a token URL');
  }
  botLogger.info('bot.portal.registered', {
    daemonId: BOT_USER_ID,
    ownerUserId: BOT_OWNER_USER_ID,
  }, 'Registered with portal control plane');
  return body.url;
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

async function flushAcpBufferedContent(state, roomId) {
  const buffers = state?._acpBuffers;
  if (!buffers) return;
  if (buffers.currentMessageText) {
    const messageId = `acp-msg-${buffers.msgCounter++}`;
    await flushDelta(messageId);
    await botSend(roomId, { type: 'assistant.message', messageId, content: buffers.currentMessageText });
    buffers.currentMessageText = '';
  }
  if (buffers.currentThoughtText) {
    const reasoningId = `acp-reason-${buffers.reasonCounter++}`;
    await flushDelta(`reasoning-${reasoningId}`);
    await botSend(roomId, { type: 'assistant.reasoning', reasoningId, content: buffers.currentThoughtText });
    buffers.currentThoughtText = '';
  }
}

// ── Session Helpers ──

async function emitSessionState(sessionId, { broadcastStatus = true } = {}) {
  const state = sessions.get(sessionId);
  if (!state) return;
  await botSend(sessionId, { type: 'session.state', ready: !!state.isReady, processing: state.isProcessing, stopping: state.isStopping, pendingCount: state.pendingCount, model: state.model });
  if (broadcastStatus) {
    broadcastSessionStatus(sessionId, state);
  }
}

function broadcastSessionStatus(sessionId, state) {
  if (!state || !BOT_USER_ID) return;
  const syncRoomId = daemonAclRoomId(BOT_USER_ID);
  const payload = {
    type: 'session.touch',
    sessionId,
    daemonId: BOT_USER_ID,
    agentName: state.agentName,
    ownerUserId: state.ownerUserId,
    workingDirectory: state.workingDirectory,
    sessionProcessing: !!state.isProcessing,
    sessionStopping: !!state.isStopping,
    sessionReady: !!state.isReady,
    updatedAt: new Date().toISOString(),
  };
  botSend(syncRoomId, payload).catch((err) => {
    getSessionLogger(sessionId, state).child({ area: 'sync' }).warn('session.status.broadcast.failed', {
      error: err,
    }, 'Session status broadcast failed');
  });
}

function deactivateSession(sessionId, message) {
  const state = sessions.get(sessionId);
  if (!state) return;
  const activeDelegation = state.activeDelegation;
  cleanupClientTerminals(state._acpClient);
  state.active = false;
  state.isReady = false;
  state.isProcessing = false;
  state.isStopping = false;
  state.startupPromise = null;
  state.pendingCount = 0;
  state.acpConnection = null;
  state.acpSessionId = null;
  state.acpProcess = null;
  state._acpClient = null;
  state._acpBuffers = null;
  state.isResuming = false;
  state.toolInvocations.clear();
  for (const pending of state.pendingPermissions.values()) {
    try { pending.resolve(false); } catch {}
  }
  state.pendingPermissions.clear();
  if (activeDelegation) {
    void settleActiveDelegation(state, sessionId, 'failed', { errorMessage: message || 'Session deactivated' });
  }
  botSend(sessionId, { type: 'session.error', message });
  emitSessionState(sessionId);
}

async function cancelSessionTurn(state, roomId) {
  if (!state || (!state.isProcessing && !state.isStopping)) return false;
  if (state.isStopping) return true;
  state.isStopping = true;
  state.pendingCount = 0;
  await emitSessionState(roomId);

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
  await emitSessionState(roomId);
  return false;
}

async function sendSessionPrompt(state, roomId, prompt, { includeDelegationContext = true } = {}) {
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
  const promptText = includeDelegationContext
    ? buildDelegationContextPrompt(prompt, state.delegationContextEntries)
    : String(prompt || '').trim();
  // SDK mode
  if (state.copilotSession) {
    state.lastAssistantMessageContent = '';
    state.lastReasoningContent = '';
    state.isProcessing = true;
    state.isStopping = false;
    await emitSessionState(roomId);
    try {
      await state.copilotSession.send({ prompt: promptText });
      await settleActiveDelegation(state, roomId, 'completed');
    } catch (err) {
      const cancelled = isCancellationError(err);
      if (!state.isStopping || !cancelled) {
        botSend(roomId, { type: 'session.error', message: err.message });
      }
      await settleActiveDelegation(state, roomId, cancelled ? 'cancelled' : 'failed', {
        errorMessage: cancelled ? 'Delegation cancelled' : err.message,
      });
    }
    return;
  }
  // ACP mode
  if (!state.acpConnection) {
    botSend(roomId, { type: 'session.error', message: 'Agent is still starting… please wait.' });
    return;
  }
  state.lastAssistantMessageContent = '';
  state.lastReasoningContent = '';
  state.isProcessing = true;
  state.isStopping = false;
  await emitSessionState(roomId);
  const stillCurrent = () => sessions.get(roomId) === state;
  const finalizePromptTurn = async ({ emitIdle = true } = {}) => {
    if (!stillCurrent()) return;
    await flushAcpBufferedContent(state, roomId);
    if (!stillCurrent()) return;
    flushCompletedToolInvocations(roomId);
    if (!stillCurrent()) return;
    state.isProcessing = false;
    state.isStopping = false;
    state.pendingCount = 0;
    if (emitIdle) {
      await botSend(roomId, { type: 'session.idle' });
      if (!stillCurrent()) return;
    }
    await emitSessionState(roomId);
  };
  try {
    await state.acpConnection.prompt({ sessionId: state.acpSessionId, prompt: [{ type: 'text', text: promptText }] });
    await finalizePromptTurn();
    await settleActiveDelegation(state, roomId, 'completed');
  } catch (err) {
    const cancelled = isCancellationError(err);
    await finalizePromptTurn({ emitIdle: cancelled });
    if (!cancelled && stillCurrent()) {
      botSend(roomId, { type: 'session.error', message: err.message });
    }
    await settleActiveDelegation(state, roomId, cancelled ? 'cancelled' : 'failed', {
      errorMessage: cancelled ? 'Delegation cancelled' : err.message,
    });
    return;
  }
}

// ── ACP Session Creation ──

function isCancellationError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return error?.code === -32800 || text.includes('cancelled') || text.includes('canceled') || text.includes('aborted');
}

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

function spawnAcpChild(sessionId, agentName, launch) {
  const resolvedLaunch = resolveSpawnLaunch(launch.command, launch.args || []);
  const processLogger = getSessionLogger(sessionId, { agentName }).child({
    area: 'acp-process',
    launchSource: launch.source,
  });
  const child = spawn(resolvedLaunch.command, resolvedLaunch.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(ACP_AGENTS[agentName]?.env || {}) },
    shell: false,
  });
  child.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      processLogger.debug('acp.process.stderr', { line }, 'ACP process wrote to stderr');
    }
  });
  child.on('error', (err) => {
    processLogger.error('acp.process.spawn.failed', {
      command: launch.command,
      args: launch.args || [],
      resolvedCommand: resolvedLaunch.command,
      resolvedArgs: resolvedLaunch.args,
      error: err,
    }, 'Failed to spawn ACP process');
    deactivateSession(sessionId, `Failed to start: ${err.message}`);
  });
  child.on('close', (code) => {
    processLogger.info('acp.process.exited', { exitCode: code }, 'ACP process exited');
    deactivateSession(sessionId, `Agent exited (code=${code})`);
  });
  return child;
}

async function createAcpSession(sessionId, agentName, workingDirectory) {
  const config = ACP_AGENTS[agentName];
  if (!config) throw new Error(`Unknown ACP agent: ${agentName}`);
  const launch = resolveAcpLaunch(config);
  const sessionLogger = getSessionLogger(sessionId, { agentName }).child({
    area: 'acp',
    launchSource: launch.source,
  });

  sessionLogger.info('acp.session.starting', {
    command: launch.command,
    args: launch.args || [],
    workingDirectory,
  }, 'Starting ACP session');

  const child = spawnAcpChild(sessionId, agentName, launch);

  const readable = Readable.toWeb(child.stdout);
  const writable = Writable.toWeb(child.stdin);
  const stream = ndJsonStream(writable, readable);
  const client = createAcpClient(sessionId);
  const connection = new ClientSideConnection((agent) => { client._agent = agent; return client; }, stream);

  const timeoutHandler = () => {
    sessionLogger.error('acp.session.startup.timeout', {
      timeoutMs: ACP_STARTUP_TIMEOUT_MS,
    }, 'ACP startup timed out');
    killChildProcess(child);
  };

  const initResponse = await withTimeout(connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: 'codeagenthub-daemon', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  }), ACP_STARTUP_TIMEOUT_MS, `ACP initialize for ${agentName}`, timeoutHandler);
  sessionLogger.info('acp.initialize.completed', {
    initializedAgentName: initResponse.agentInfo?.name || agentName,
    initializedAgentVersion: initResponse.agentInfo?.version || '?',
  }, 'ACP initialized');

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
      sessionLogger.info('acp.auth.required', { methodName: authMethods[0].name }, 'ACP authentication required');
      await withTimeout(
        connection.authenticate({ methodId: authMethods[0].id }),
        ACP_STARTUP_TIMEOUT_MS,
        `ACP authenticate for ${agentName}`,
        timeoutHandler,
      );
      sessionLogger.info('acp.auth.completed', { methodName: authMethods[0].name }, 'ACP authentication completed');
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
  sessionLogger.info('acp.session.created', {
    acpSessionId: sessionResponse.sessionId,
  }, 'ACP session created');

  return {
    connection,
    client,
    acpSessionId: sessionResponse.sessionId,
    process: child,
    displayName: initResponse.agentInfo?.title || initResponse.agentInfo?.name || config.displayName,
    agentCapabilities: initResponse.agentCapabilities || {},
    sessionResponse,
  };
}

async function resumeAcpSession(sessionId, agentName, acpSessionId, workingDirectory) {
  const config = ACP_AGENTS[agentName];
  if (!config) throw new Error(`Unknown ACP agent: ${agentName}`);
  const launch = resolveAcpLaunch(config);
  const sessionLogger = getSessionLogger(sessionId, { agentName }).child({
    area: 'acp',
    launchSource: launch.source,
  });

  sessionLogger.info('acp.session.resuming', {
    acpSessionId,
    workingDirectory,
  }, 'Resuming ACP session');

  const child = spawnAcpChild(sessionId, agentName, launch);

  const readable = Readable.toWeb(child.stdout);
  const writable = Writable.toWeb(child.stdin);
  const stream = ndJsonStream(writable, readable);
  const client = createAcpClient(sessionId);
  const connection = new ClientSideConnection((agent) => { client._agent = agent; return client; }, stream);

  const timeoutHandler = () => {
    sessionLogger.error('acp.session.resume.timeout', {
      timeoutMs: ACP_STARTUP_TIMEOUT_MS,
      acpSessionId,
    }, 'ACP resume timed out');
    killChildProcess(child);
  };

  const initResponse = await withTimeout(connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: 'codeagenthub-daemon', version: '1.0.0' },
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  }), ACP_STARTUP_TIMEOUT_MS, `ACP initialize for ${agentName}`, timeoutHandler);

  const sessionResponse = await (async () => {
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
      sessionLogger.info('acp.resume.auth.required', {
        methodName: authMethods[0].name,
        acpSessionId,
      }, 'ACP authentication required for resume');
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
    agentCapabilities: initResponse.agentCapabilities || {},
    sessionResponse,
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
  const shouldTryResume = shouldTryAutoResumeSession(state, envelope?.type);
  if (!shouldTryResume) return state;

  const saved = sessionStore.get(roomId);
  if (!saved?.supportsResume) return state;

  const resumePromise = (async () => {
    const resumeLogger = getSessionLogger(roomId, { agentName: saved.agentName }).child({ area: 'resume' });
    resumeLogger.info('session.auto-resume.started', {
      savedAgentName: saved.agentName,
    }, 'Auto-resuming session');
    await botSend(roomId, { type: 'system.info', message: 'Resuming session…' });

    try {
      if (state?.active === false) sessions.delete(roomId);

      if (saved.agentName === 'copilot-sdk') {
        state = createSessionState({
          sessionId: roomId,
          agentName: 'copilot-sdk',
          workingDirectory: saved.cwd || process.cwd(),
          model: saved.model || DEFAULT_SDK_MODEL,
          delegationContextEntries: saved.delegationContextEntries || [],
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
        delegationContextEntries: saved.delegationContextEntries || [],
      });
      state.isResuming = true;
      sessions.set(roomId, state);
      const acp = await resumeAcpSession(roomId, saved.agentName, saved.acpSessionId, saved.cwd || process.cwd());
      Object.assign(state, {
        acpConnection: acp.connection,
        acpProcess: acp.process,
        acpSessionId: acp.acpSessionId,
        _acpClient: acp.client,
        _acpBuffers: { currentMessageText: '', currentThoughtText: '', msgCounter: 0, reasonCounter: 0 },
        active: true,
        isReady: true,
        isResuming: false,
      });
      seedAcpSessionToolbarState(state, acp.sessionResponse);
      emitSessionState(roomId);
      await botSend(roomId, { type: 'system.info', message: `Resumed ${acp.displayName}` });
      return state;
    } catch (err) {
      if (saved.agentName === 'copilot-sdk' && /Session not found:/i.test(String(err?.message || ''))) {
        resumeLogger.warn('session.auto-resume.sdk-target-missing', {
          error: err,
        }, 'SDK resume target missing; recreating session');
        state = createSessionState({
          sessionId: roomId,
          agentName: 'copilot-sdk',
          workingDirectory: saved.cwd || process.cwd(),
          model: saved.model || DEFAULT_SDK_MODEL,
          delegationContextEntries: saved.delegationContextEntries || [],
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
      resumeLogger.error('session.auto-resume.failed', {
        error: err,
      }, 'Session resume failed');
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

/* ─────────────────────────────────────────────────────────────────────────
 * Chat notification handlers
 *
 * `handleBotNotification` is the single entry point invoked by the
 * ChatClient listener. It does framing (parse JSON, drop self-messages,
 * route by room/envelope-type) and delegates to one of the handlers
 * below; each handler closes over the daemon's module-scope state
 * (sessions, sessionStore, BOT_USER_ID…) so they don't take that as args.
 * ───────────────────────────────────────────────────────────────────────── */

async function handleDaemonControlEnvelope(envelope) {
  if (envelope.type !== 'workspace.list_request') return;
  if (envelope.daemonId !== BOT_USER_ID || !envelope.requestId || !envelope.requesterUserId) return;
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

async function handleDelegationRequest(roomId, delegationEnvelope) {
  if (!String(delegationEnvelope.prompt || '').trim()) {
    await failDelegationRequest(delegationEnvelope, 'Delegation prompt is empty');
    return;
  }

  const state = await tryResumeSession(roomId, delegationEnvelope) || sessions.get(roomId);
  if (!state || state.active === false) {
    await failDelegationRequest(delegationEnvelope, 'Target session is not active on this daemon');
    return;
  }
  if (state.activeDelegation && state.activeDelegation.delegationId !== delegationEnvelope.delegationId) {
    await failDelegationRequest(delegationEnvelope, 'Target session is already running another delegation');
    return;
  }
  if (state.isProcessing && (!state.activeDelegation || state.activeDelegation.delegationId !== delegationEnvelope.delegationId)) {
    await failDelegationRequest(delegationEnvelope, 'Target session is busy');
    return;
  }

  await startDelegationForSession(state, roomId, delegationEnvelope);
  await botSend(roomId, {
    type: 'system.info',
    message: `Delegated prompt from ${delegationEnvelope.requesterUserId}`,
  });
  await botSend(roomId, {
    type: 'user.prompt',
    content: delegationEnvelope.prompt,
  });
  await sendSessionPrompt(state, roomId, delegationEnvelope.prompt, { includeDelegationContext: false });
}

async function handleDelegationCancel(roomId, delegationEnvelope) {
  const state = sessions.get(roomId) || await tryResumeSession(roomId, delegationEnvelope);
  if (!state?.activeDelegation || state.activeDelegation.delegationId !== delegationEnvelope.delegationId) return;
  try {
    await cancelSessionTurn(state, roomId);
  } catch (err) {
    state.isStopping = false;
    emitSessionState(roomId);
    await botSend(roomId, { type: 'session.error', message: `Failed to stop delegated response: ${err.message}` });
    await settleActiveDelegation(state, roomId, 'failed', { errorMessage: err.message });
  }
}

async function handleDelegationControl(roomId, msg, delegationEnvelope) {
  if (!isPortalControlUser(msg.createdBy)) {
    getSessionLogger(roomId).child({ area: 'security' }).warn('delegation.control.unauthorized', {
      actorUserId: msg.createdBy,
    }, 'Ignoring unauthorized delegation control');
    return;
  }
  if (delegationEnvelope.targetDaemonId !== BOT_USER_ID) {
    getSessionLogger(roomId).child({ area: 'delegation' }).warn('delegation.request.wrong-target', {
      delegationId: delegationEnvelope.delegationId,
      targetDaemonId: delegationEnvelope.targetDaemonId,
    }, 'Ignoring delegation for another daemon');
    return;
  }
  if (delegationEnvelope.type === 'control.delegation.request') {
    await handleDelegationRequest(roomId, delegationEnvelope);
  } else if (delegationEnvelope.type === 'control.delegation.cancel') {
    await handleDelegationCancel(roomId, delegationEnvelope);
  }
}

async function handleControlCreate(roomId, msg, envelope) {
  if (!isPortalControlUser(msg.createdBy)) {
    getSessionLogger(roomId).child({ area: 'security' }).warn('control.create.unauthorized', {
      actorUserId: msg.createdBy,
    }, 'Ignoring unauthorized session create');
    return;
  }
  const { userId, agentName, workingDirectory, initialPrompt, model } = envelope;
  getSessionLogger(roomId, { agentName }).child({ area: 'control' }).info('control.create.received', {
    ownerUserId: userId,
    requestedWorkingDirectory: workingDirectory,
    hasInitialPrompt: !!String(initialPrompt || '').trim(),
    model: model || undefined,
  }, 'Received session create request');
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
      await syncSessionUiState(roomId, state);
      if (initialPrompt) {
        await sendSessionPrompt(state, roomId, initialPrompt);
      }
    } catch (err) {
      getSessionLogger(roomId, state).child({ area: 'startup' }).error('sdk.session.start.failed', {
        error: err,
      }, 'Copilot SDK session start failed');
      deactivateSession(roomId, `Failed to start: ${err.message}`);
    } finally {
      state.startupPromise = null;
    }
    return;
  }

  await botSend(roomId, { type: 'system.info', message: `Starting ${ACP_AGENTS[agentName]?.displayName || agentName}…` });
  try {
    let connectedDisplayName = ACP_AGENTS[agentName]?.displayName || agentName;
    state.startupPromise = (async () => {
      const acp = await createAcpSession(roomId, agentName, selectedWorkingDirectory);
      Object.assign(state, {
        acpConnection: acp.connection,
        acpProcess: acp.process,
        acpSessionId: acp.acpSessionId,
        _acpClient: acp.client,
        _acpBuffers: { currentMessageText: '', currentThoughtText: '', msgCounter: 0, reasonCounter: 0 },
        active: true,
        isReady: true,
      });
      seedAcpSessionToolbarState(state, acp.sessionResponse);
      connectedDisplayName = acp.displayName || connectedDisplayName;
      persistSessionRecord(roomId, {
        agentName,
        acpSessionId: acp.acpSessionId,
        cwd: selectedWorkingDirectory,
        supportsResume: acp.agentCapabilities?.loadSession ?? false,
        delegationContextEntries: state.delegationContextEntries,
      });
    })();
    await state.startupPromise;
    await botSend(roomId, { type: 'system.info', message: `Connected to ${connectedDisplayName}` });
    await syncSessionUiState(roomId, state);
    if (initialPrompt) await sendSessionPrompt(state, roomId, initialPrompt);
  } catch (err) {
    getSessionLogger(roomId, state).child({ area: 'startup' }).error('acp.session.start.failed', {
      error: err,
    }, 'ACP session start failed');
    deactivateSession(roomId, `Failed to start: ${err.message}`);
  } finally {
    state.startupPromise = null;
  }
}

async function handleControlDelete(roomId, msg) {
  const state = sessions.get(roomId);
  if (!isPortalControlUser(msg.createdBy) && !isSessionOwner(state, msg.createdBy)) {
    getSessionLogger(roomId, state).child({ area: 'security' }).warn('control.delete.unauthorized', {
      actorUserId: msg.createdBy,
    }, 'Ignoring unauthorized session delete');
    return;
  }
  await stopExistingSession(state);
  sessions.delete(roomId);
  deleteSessionRecord(roomId);
  getSessionLogger(roomId, state).child({ area: 'control' }).info('session.deleted', {}, 'Session deleted');
}

async function handleControlCancel(roomId, msg) {
  const state = sessions.get(roomId);
  if (!state) return;
  if (!isPortalControlUser(msg.createdBy) && !isSessionOwner(state, msg.createdBy)) {
    getSessionLogger(roomId, state).child({ area: 'security' }).warn('control.cancel.unauthorized', {
      actorUserId: msg.createdBy,
    }, 'Ignoring unauthorized session cancel');
    return;
  }
  try {
    await cancelSessionTurn(state, roomId);
  } catch (err) {
    state.isStopping = false;
    emitSessionState(roomId);
    await botSend(roomId, { type: 'session.error', message: `Failed to stop current response: ${err.message}` });
  }
}

async function handleUserCommand(roomId, state, command) {
  const cmd = command.trim();
  if (!cmd) return;
  getSessionLogger(roomId, state).info('session.command.received', {
    commandName: cmd.split(/\s+/)[0] || cmd,
  }, 'Received user command');
  if (cmd === '/clear') {
    await botSend(roomId, { type: 'system.clear' });
    return;
  }
  if (cmd.startsWith('/model ')) {
    await handleModelSwitch(state, roomId, cmd.slice(7).trim());
    return;
  }
  if (cmd.startsWith('/mode ')) {
    await handleModeSwitch(state, roomId, cmd.slice(6).trim());
    return;
  }
  await sendSessionPrompt(state, roomId, cmd);
}

async function handlePermissionResponse(roomId, state, msg, envelope) {
  if (!envelope.requestId) return;
  if (!isPortalControlUser(msg.createdBy) && !isSessionOwner(state, msg.createdBy) && msg.createdBy !== BOT_OWNER_USER_ID) {
    getSessionLogger(roomId, state).warn('permission.response.ignored', {
      requestId: envelope.requestId,
      userId: msg.createdBy,
    }, 'Ignoring permission response from unauthorized user');
    return;
  }
  const pending = state.pendingPermissions.get(envelope.requestId);
  if (!pending) return;
  getSessionLogger(roomId, state).info('permission.response.received', {
    approved: !!envelope.approved,
    requestId: envelope.requestId.substring(0, 8),
    userId: msg.createdBy,
  }, 'Received permission response');
  pending.resolve(!!envelope.approved);
  state.pendingPermissions.delete(envelope.requestId);
}

async function handleSessionEnvelope(roomId, msg, envelope) {
  const state = await tryResumeSession(roomId, envelope) || sessions.get(roomId);
  if (!state) return;
  switch (envelope.type) {
    case 'user.prompt':
      if (envelope.content) {
        getSessionLogger(roomId, state).info('session.prompt.received', {
          promptLength: String(envelope.content).length,
        }, 'Received user prompt');
        await sendSessionPrompt(state, roomId, envelope.content);
      }
      return;
    case 'user.command':
      if (envelope.command) await handleUserCommand(roomId, state, envelope.command);
      return;
    case 'permission.response':
      await handlePermissionResponse(roomId, state, msg, envelope);
      return;
    case 'session.sync_state':
      syncSessionUiState(roomId, state);
      return;
  }
}

async function handleBotNotification(notification) {
  try {
    const msg = notification.message;
    const roomId = notification.conversation?.roomId;
    if (msg.createdBy === BOT_USER_ID || !roomId || !msg.content?.text) return;

    let envelope;
    try { envelope = JSON.parse(msg.content.text); } catch { return; }

    if (roomId === DAEMON_CONTROL_ROOM) {
      await handleDaemonControlEnvelope(envelope);
      return;
    }

    const delegationEnvelope = parseDelegationTargetControlEnvelope(envelope);
    if (delegationEnvelope) {
      await handleDelegationControl(roomId, msg, delegationEnvelope);
      return;
    }

    const delegationSummaryEnvelope = parseDelegationSummaryEnvelope(envelope);
    if (delegationSummaryEnvelope) {
      rememberDelegationContext(roomId, delegationSummaryEnvelope);
      return;
    }

    if (envelope.type === 'control.create') {
      await handleControlCreate(roomId, msg, envelope);
      return;
    }
    if (envelope.type === 'control.delete') {
      await handleControlDelete(roomId, msg);
      return;
    }
    if (envelope.type === 'control.cancel') {
      await handleControlCancel(roomId, msg);
      return;
    }

    await handleSessionEnvelope(roomId, msg, envelope);
  } catch (err) {
    daemonLogger.error('chat.message.handle.failed', {
      error: err,
      roomId: notification.conversation?.roomId,
    }, 'Failed to handle incoming chat message');
  }
}

// ── ACP Client (sessionUpdate / fs / terminal / permission) ──

function pickToolName(currentName, metaToolName, updateToolName, title) {
  for (const candidate of [metaToolName, updateToolName]) {
    if (candidate && !isGenericToolName(candidate)) return candidate;
  }
  if (currentName && !isGenericToolName(currentName)) return currentName;
  if (title && !looksLikeCommand(title)) return title;
  return currentName || metaToolName || updateToolName || title || 'Tool';
}

/**
 * Build the Client implementation passed to ACP's ClientSideConnection. One
 * createAcpClient call backs one ACP session (the daemon spawns one child
 * process per session, so there is exactly one Client per connection).
 *
 * The returned object owns:
 *   - sessionUpdate handling: turns raw ACP `session/update` notifications
 *     into chat envelopes (assistant.delta / assistant.message /
 *     assistant.reasoning / tool.start / tool.end / mode.changed / usage.update
 *     / session.error).
 *   - permission requests: forwards to the chat room and resolves once the
 *     user replies via `permission.response`.
 *   - readTextFile / writeTextFile: scoped to the session's workingDirectory
 *     via resolveSessionPath().
 *   - createTerminal / terminalOutput / waitForTerminalExit / killTerminal /
 *     releaseTerminal: a small in-process terminal pool kept on the client
 *     itself (`_terminals`) so cleanupClientTerminals() can kill them on
 *     session teardown.
 *
 * Streaming text (`agent_message_chunk` / `agent_thought_chunk`) is buffered
 * on `state._acpBuffers`, which is owned by the SessionState and read by
 * flushAcpBufferedContent() at end-of-turn.
 */
function createAcpClient(sessionId) {
  return {
    _agent: null,

    async requestPermission(params) {
      const state = sessions.get(sessionId);
      if (!state) return { outcome: { outcome: 'cancelled' } };
      const requestId = randomUUID();
      await botSend(sessionId, {
        type: 'permission.request',
        requestId,
        kind: 'shell',
        description: params.toolCall?.title || 'Permission',
        ...params,
      });
      return new Promise((resolve) => {
        state.pendingPermissions.set(requestId, {
          resolve: (approved) => {
            const allowOpt = params.options?.find(o => o.kind?.startsWith('allow'));
            resolve(approved
              ? { outcome: { outcome: 'selected', optionId: allowOpt?.optionId || params.options?.[0]?.optionId } }
              : { outcome: { outcome: 'cancelled' } });
          },
          request: params,
          timestamp: Date.now(),
        });
        setTimeout(() => {
          if (state.pendingPermissions.has(requestId)) {
            state.pendingPermissions.delete(requestId);
            resolve({ outcome: { outcome: 'cancelled' } });
          }
        }, 5 * 60 * 1000);
      });
    },

    async sessionUpdate(params) {
      const update = params.update;
      const type = update?.sessionUpdate;
      const state = sessions.get(sessionId);
      const buffers = state?._acpBuffers;
      const sessionLogger = getSessionLogger(sessionId, state);
      if (state?.isResuming) {
        if (!['available_commands_update', 'current_mode_update', 'usage_update', 'config_option_update'].includes(type)) {
          return;
        }
      }
      if (type === 'tool_call' || type === 'tool_call_update') {
        const debugKeys = Object.keys(update).filter(k => k !== 'sessionUpdate');
        let rawOutputLength = 0;
        try {
          rawOutputLength = update.rawOutput == null ? 0 : (JSON.stringify(update.rawOutput)?.length || 0);
        } catch {
          rawOutputLength = update.rawOutput == null ? 0 : String(update.rawOutput).length;
        }
        sessionLogger.child({ area: 'acp' }).debug('acp.tool.update.received', {
          keys: debugKeys,
          rawOutputLength,
          updateType: type,
        }, 'Received ACP tool update');
      }
      switch (type) {
        case 'config_option_update':
          break;
        case 'user_message_chunk':
          break;
        case 'agent_message_chunk': {
          if (!buffers) break;
          flushCompletedToolInvocations(sessionId);
          const text = update.content?.text || '';
          if (!text) break;
          buffers.currentMessageText += text;
          sendDelta(sessionId, `acp-msg-${buffers.msgCounter}`, text);
          break;
        }
        case 'agent_thought_chunk': {
          if (!buffers) break;
          flushCompletedToolInvocations(sessionId);
          const text = update.content?.text || '';
          if (!text) break;
          buffers.currentThoughtText += text;
          sendDelta(
            sessionId,
            `reasoning-acp-reason-${buffers.reasonCounter}`,
            text,
            'assistant.reasoning_delta',
            'reasoningId',
            `acp-reason-${buffers.reasonCounter}`,
          );
          break;
        }
        case 'tool_call': {
          if (buffers?.currentMessageText) {
            const id = `acp-msg-${buffers.msgCounter++}`;
            await flushDelta(id);
            await botSend(sessionId, { type: 'assistant.message', messageId: id, content: buffers.currentMessageText });
            buffers.currentMessageText = '';
          }
          if (buffers?.currentThoughtText) {
            const rid = `acp-reason-${buffers.reasonCounter++}`;
            await flushDelta(`reasoning-${rid}`);
            await botSend(sessionId, { type: 'assistant.reasoning', reasoningId: rid, content: buffers.currentThoughtText });
            buffers.currentThoughtText = '';
          }
          const tcId = update.toolCallId || randomUUID();
          const meta = update._meta?.claudeCode || {};
          flushCompletedToolInvocations(sessionId, tcId);
          const invocation = state?.toolInvocations?.get(tcId) || {
            name: 'Tool', args: undefined, output: '', success: true, completedPending: false, started: false,
          };
          const name = pickToolName(invocation.name, meta.toolName, update.toolName, update.title);
          const status = update.status || 'pending';
          const toolInput = normalizeToolArgs(meta.input || update.input, update.title);
          const toolOutput = normalizeToolOutput(update.rawOutput?.content ?? update.rawOutput ?? update.toolResponse ?? meta.toolResponse ?? '');
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
          if (invocation.completedPending) flushCompletedToolInvocations(sessionId);
          sessionLogger.child({ area: 'tool', toolCallId: tcId, toolName: name }).debug('tool.update', {
            outputLength: toolOutput ? String(toolOutput).length : 0,
            status,
          }, 'Processed tool call update');
          break;
        }
        case 'tool_call_update': {
          if (!update.toolCallId) {
            sessionLogger.child({ area: 'tool' }).warn('tool.update.missingId', {}, 'Ignoring tool_call_update without toolCallId');
            break;
          }
          const tcId = update.toolCallId;
          const status = update.status || 'completed';
          const meta = update._meta?.claudeCode || {};
          flushCompletedToolInvocations(sessionId, tcId);
          const invocation = state?.toolInvocations?.get(tcId) || {
            name: 'Tool', args: undefined, output: '', success: true, completedPending: false, started: false,
          };
          const name = pickToolName(invocation.name, meta.toolName, update.toolName, update.title);
          const toolInput = normalizeToolArgs(meta.input || update.input, update.title);
          const toolOutput = normalizeToolOutput(update.rawOutput?.content ?? update.rawOutput ?? update.toolResponse ?? meta.toolResponse ?? '');
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
          if (invocation.completedPending) flushCompletedToolInvocations(sessionId);
          sessionLogger.child({ area: 'tool', toolCallId: tcId, toolName: name }).debug('tool.update', {
            outputLength: toolOutput ? String(toolOutput).length : 0,
            status,
          }, 'Processed tool call completion update');
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
        default:
          if (type) {
            sessionLogger.child({ area: 'acp' }).debug('acp.update.unhandled', {
              updateType: type,
            }, 'Received unhandled ACP session update');
          }
      }
    },

    // ── File System (local, scoped to session.workingDirectory) ──
    async readTextFile(params) {
      const state = sessions.get(sessionId);
      const filePath = resolveSessionPath(state?.workingDirectory, params.path);
      getSessionLogger(sessionId, state).child({ area: 'fs' }).debug('filesystem.read', {
        filePath: summarizePathForLog(relative(state?.workingDirectory || process.cwd(), filePath) || params.path),
      }, 'Reading text file');
      let content = await readFile(filePath, 'utf-8');
      if (params.line != null || params.limit != null) {
        const lines = content.split('\n');
        content = lines.slice((params.line ?? 1) - 1, params.limit ? (params.line ?? 1) - 1 + params.limit : lines.length).join('\n');
      }
      return { content };
    },

    async writeTextFile(params) {
      const state = sessions.get(sessionId);
      const filePath = resolveSessionPath(state?.workingDirectory, params.path);
      getSessionLogger(sessionId, state).child({ area: 'fs' }).debug('filesystem.write', {
        contentLength: params.content?.length || 0,
        filePath: summarizePathForLog(relative(state?.workingDirectory || process.cwd(), filePath) || params.path),
      }, 'Writing text file');
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, params.content, 'utf-8');
      return {};
    },

    // ── Terminal (local, in-process pool) ──
    _terminals: new Map(),
    _termNextId: 1,

    async createTerminal(params) {
      const id = `term_${this._termNextId++}`;
      const state = sessions.get(sessionId);
      const cwd = resolveSessionPath(state?.workingDirectory, params.cwd || '.');
      getSessionLogger(sessionId, state).child({ area: 'terminal' }).debug('terminal.created', {
        argCount: (params.args || []).length,
        command: params.command,
        cwd: summarizePathForLog(relative(state?.workingDirectory || process.cwd(), cwd) || params.cwd || '.'),
        terminalId: id,
      }, 'Created local terminal');
      const child = spawn(params.command, params.args || [], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      const limit = params.outputByteLimit ?? 1024 * 1024;
      child.stdout?.on('data', d => { output += d.toString(); if (output.length > limit) output = output.slice(-limit); });
      child.stderr?.on('data', d => { output += d.toString(); if (output.length > limit) output = output.slice(-limit); });
      const exitPromise = new Promise(r => {
        child.on('close', code => {
          const t = this._terminals.get(id);
          if (t) { t.exitCode = code; t.exited = true; }
          r();
        });
        child.on('error', () => r());
      });
      this._terminals.set(id, { process: child, output: () => output, exitCode: null, exited: false, exitPromise });
      return { terminalId: id };
    },

    async terminalOutput(params) {
      const t = this._terminals.get(params.terminalId);
      return { output: t?.output() || '', truncated: false };
    },

    async waitForTerminalExit(params) {
      const t = this._terminals.get(params.terminalId);
      if (t && !t.exited) {
        await Promise.race([t.exitPromise, new Promise(r => setTimeout(r, params.timeout ?? 30000))]);
      }
      const code = t?.exitCode ?? -1;
      getSessionLogger(sessionId).child({ area: 'terminal' }).debug('terminal.exited', {
        exitCode: code,
        terminalId: params.terminalId,
      }, 'Terminal exited');
      return { exitCode: code };
    },

    async killTerminal(params) {
      const t = this._terminals.get(params.terminalId);
      if (t) try { t.process.kill('SIGTERM'); } catch {}
      return {};
    },

    async releaseTerminal(params) {
      this._terminals.delete(params.terminalId);
      return {};
    },
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

  copilotSession.on('assistant.message', async (event) => {
    await flushDelta(event.data.messageId);
    await botSend(sessionId, { type: 'assistant.message', messageId: event.data.messageId, content: event.data.content });
  });

  copilotSession.on('assistant.reasoning_delta', (event) => {
    sendDelta(sessionId, `reasoning-${event.data.reasoningId}`, event.data.deltaContent, 'assistant.reasoning_delta', 'reasoningId', event.data.reasoningId);
  });

  copilotSession.on('assistant.reasoning', async (event) => {
    await flushDelta(`reasoning-${event.data.reasoningId}`);
    await botSend(sessionId, { type: 'assistant.reasoning', reasoningId: event.data.reasoningId, content: event.data.content });
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

  copilotSession.on('session.idle', async () => {
    state.isProcessing = false;
    state.isStopping = false;
    state.pendingCount = 0;
    await botSend(sessionId, { type: 'session.idle' });
    await emitSessionState(sessionId);
  });

  copilotSession.on('session.error', async (event) => {
    state.isProcessing = false;
    state.isStopping = false;
    state.pendingCount = 0;
    await emitSessionState(sessionId);
    await botSend(sessionId, { type: 'session.error', message: String(event.data) });
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

  await ensureStartupIdentity();

  await sessionStore.load();

  daemonLogger.info('daemon.starting', {}, 'Daemon starting');

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

  botChatHandle = createBotChat({
    logger: botLogger,
    tokenUrlProvider: fetchBotTokenUrl,
    messageHandler: handleBotNotification,
    isShuttingDown: () => shuttingDown,
    controlRoom: DAEMON_CONTROL_ROOM,
    controlRoomName: 'Daemon Control',
    controlMembers: [PORTAL_CONTROL_USER_ID],
    ownerLabel: BOT_USER_ID,
    maxMessageLength: MAX_ROOM_MESSAGE_LENGTH,
  });

  await ensureBotChatReady();

  const announceOffline = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await sessionStore.flush();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    try {
      if (daemonPresenceInfo) {
        await sendDaemonPresence('daemon.offline', daemonPresenceInfo);
      }
    } catch (e) {
      daemonLogger.warn('daemon.offline.announceFailed', {
        error: e,
      }, 'Failed to announce daemon offline state');
    }
    botChatHandle.stop();
  };

  const handleShutdown = (signal) => {
    void announceOffline().finally(() => process.exit(signal === 'SIGINT' ? 130 : 0));
  };

  process.once('SIGINT', () => handleShutdown('SIGINT'));
  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  try {
    await sendDaemonPresence('daemon.online', daemonPresenceInfo);
    daemonLogger.info('daemon.registered', {
      agents: daemonPresenceInfo.agents,
      daemonId: BOT_USER_ID,
      hostname: daemonPresenceInfo.hostname,
    }, 'Daemon registered with portal');
    // After registration the portal adds the daemon bot to the daemon-acl room.
    // Hydrate the room in the local ChatClient cache so botSend can sendToRoom.
    const syncRoomId = daemonAclRoomId(BOT_USER_ID);
    try {
      const chat = await ensureBotChatReady();
      if (chat) {
        // addUserToRoom(self) hydrates the local _rooms cache AND _joinedRoomIds.
        // This is required for botSend → sendToRoom to find the defaultConversationId.
        await chat.addUserToRoom(syncRoomId, BOT_USER_ID);
        daemonLogger.info('daemon.syncRoom.joined', {
          roomId: syncRoomId,
        }, 'Joined daemon sync room');
      }
    } catch (err) {
      // If addUserToRoom failed (e.g. permission error), try getRoom as last resort
      // to at least log the failure clearly.
      daemonLogger.warn('daemon.syncRoom.joinFailed', {
        error: err,
        roomId: syncRoomId,
      }, 'Failed to join daemon sync room');
      try {
        const chat = await ensureBotChatReady();
        if (chat) {
          const ri = await chat.getRoom(syncRoomId, false);
          daemonLogger.warn('daemon.syncRoom.cacheMissing', {
            conversationId: ri?.defaultConversationId,
            roomId: syncRoomId,
          }, 'Daemon sync room exists but local cache hydration is missing');
        }
      } catch (e2) {
        daemonLogger.warn('daemon.syncRoom.lookupFailed', {
          error: e2,
          roomId: syncRoomId,
        }, 'Failed to inspect daemon sync room after join failure');
      }
    }
  } catch (e) {
    daemonLogger.warn('daemon.registration.refreshFailed', {
      error: e,
    }, 'Daemon registration refresh failed');
  }
  heartbeatTimer = setInterval(() => {
    void sendDaemonPresence('daemon.online', daemonPresenceInfo).catch((err) => {
      daemonLogger.warn('daemon.heartbeat.failed', {
        error: err,
      }, 'Daemon heartbeat failed');
    });
  }, DAEMON_HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  daemonLogger.info('daemon.ready', {}, 'Daemon ready and waiting for messages');
}

main().catch(err => {
  daemonLogger.error('daemon.fatal', { error: err }, 'Daemon exited with a fatal error');
  process.exit(1);
});
