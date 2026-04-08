import express from 'express';
import session from 'express-session';
import crypto from 'crypto';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { ChatClient } from '@azure/web-pubsub-chat-client';
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

// ── Configuration ──

const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING || process.env.WebPubSubConnectionString;
if (!connectionString) {
  console.error('Error: WEB_PUBSUB_CONNECTION_STRING or WebPubSubConnectionString environment variable is required');
  process.exit(1);
}

// GitHub OAuth (optional — if not set, fall back to username-based login)
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
const ADMIN_USER_ID = 'admin';
const VALID_USER_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const MEMBERSHIP_GRANT_TTL_MS = 5000;
const handledMembershipGrants = new Map();
const PORTAL_NEGOTIATE_PATH = '/negotiate:portal';
const DAEMON_NEGOTIATE_PATH = '/negotiate:daemon';

// ── Web PubSub Service Client ──

const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

// ── Admin ChatClient (for room management) ──

let adminChat = null;
let adminChatInitPromise = null;
let adminReconnectTimer = null;
let adminReconnectAttempt = 0;

function isAlreadyMemberError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('already') || message.includes('exists') || message.includes('member');
}

async function sendLobbyEnvelope(envelope) {
  await ensureAdminChatReady();
  if (!adminChat) return;
  await adminChat.sendToRoom(LOBBY_ROOM, JSON.stringify(envelope));
}

function pruneMembershipGrants(now = Date.now()) {
  for (const [key, expiresAt] of handledMembershipGrants.entries()) {
    if (expiresAt <= now) handledMembershipGrants.delete(key);
  }
}

function hasRecentMembershipGrant(key) {
  pruneMembershipGrants();
  const expiresAt = handledMembershipGrants.get(key);
  return typeof expiresAt === 'number' && expiresAt > Date.now();
}

function rememberMembershipGrant(key) {
  pruneMembershipGrants();
  handledMembershipGrants.set(key, Date.now() + MEMBERSHIP_GRANT_TTL_MS);
}

async function handleCreateSessionRequest(envelope) {
  const { requestId, requesterUserId, daemonId, roomName } = envelope;
  if (!requestId || !requesterUserId || !daemonId) return;
  try {
    const room = await adminChat.createRoom(
      String(roomName || 'Session'),
      [String(requesterUserId), String(daemonId), ADMIN_USER_ID],
    );
    await sendLobbyEnvelope({
      type: 'session.create_result',
      requestId,
      requesterUserId: String(requesterUserId),
      daemonId: String(daemonId),
      sessionId: room.roomId,
      roomName: room.name || String(roomName || 'Session'),
      success: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await sendLobbyEnvelope({
      type: 'session.create_result',
      requestId,
      requesterUserId: String(requesterUserId),
      daemonId: String(daemonId),
      success: false,
      error: error?.message || 'Failed to create session room',
      updatedAt: new Date().toISOString(),
    });
  }
}

async function handleApprovedJoinResponse(envelope) {
  const { sessionId, requesterUserId, ownerUserId, approved } = envelope;
  if (!approved || !sessionId || !requesterUserId) return;
  const key = `${sessionId}:${requesterUserId}`;
  if (hasRecentMembershipGrant(key)) return;
  rememberMembershipGrant(key);
  try {
    await adminChat.addUserToRoom(String(sessionId), String(requesterUserId));
    await sendLobbyEnvelope({
      type: 'session.membership_result',
      sessionId: String(sessionId),
      requesterUserId: String(requesterUserId),
      ownerUserId: ownerUserId ? String(ownerUserId) : undefined,
      granted: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const granted = isAlreadyMemberError(error);
    await sendLobbyEnvelope({
      type: 'session.membership_result',
      sessionId: String(sessionId),
      requesterUserId: String(requesterUserId),
      ownerUserId: ownerUserId ? String(ownerUserId) : undefined,
      granted,
      error: granted ? '' : (error?.message || 'Failed to grant session membership'),
      updatedAt: new Date().toISOString(),
    });
  }
}

async function ensureLobbyAccess(userId) {
  if (!userId) return;
  await ensureAdminChatReady();
  try {
    await adminChat.createRoom('Agent Lobby', [ADMIN_USER_ID, String(userId)], LOBBY_ROOM);
    return;
  } catch (error) {
    if (!isAlreadyMemberError(error)) {
      console.warn('[Web] createRoom during lobby ensure failed:', error?.message || error);
    }
  }
  try {
    await adminChat.addUserToRoom(LOBBY_ROOM, String(userId));
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
  });
  adminChat.onDisconnected(() => {
    console.warn('[Web] Admin chat disconnected; scheduling reconnect');
    adminChat = null;
    scheduleAdminReconnect();
  });
  adminChat.addListenerForNewMessage(async (notification) => {
    try {
      const roomId = notification.conversation?.roomId;
      const message = notification.message;
      if (roomId !== LOBBY_ROOM || message?.createdBy === ADMIN_USER_ID || !message?.content?.text) return;
      const envelope = JSON.parse(message.content.text);
      if (envelope.type === 'session.create_request') {
        if (message.createdBy !== envelope.requesterUserId) return;
        await handleCreateSessionRequest(envelope);
        return;
      }
      if (envelope.type === 'session.join_response') {
        if (message.createdBy !== envelope.ownerUserId) return;
        await handleApprovedJoinResponse(envelope);
      }
    } catch (error) {
      console.error('[Web] Admin listener error:', error?.message || error);
    }
  });
}

function scheduleAdminReconnect() {
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
  const token = await serviceClient.getClientAccessToken({ userId: ADMIN_USER_ID });
  adminChat = await new ChatClient(token.url).login();
  console.log(`[Web] Admin chat logged in as: ${adminChat.userId}`);

  // Ensure lobby room exists
  try {
    await adminChat.createRoom('Agent Lobby', [ADMIN_USER_ID], LOBBY_ROOM);
    console.log('[Web] Created lobby room');
  } catch {
    // Already exists — join it
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

function validateNegotiatedUserId(userId) {
  if (String(userId) === ADMIN_USER_ID) {
    return 'reserved userId is not allowed';
  }
  if (!VALID_USER_ID.test(String(userId))) {
    return 'userId must match /^[a-zA-Z0-9_-]{1,64}$/';
  }
  return '';
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
    const token = await serviceClient.getClientAccessToken({ userId: String(userId) });
    res.json({ url: token.url, userId: String(userId) });
  } catch (err) {
    console.error(`[${logLabel}] Error:`, err);
    res.status(500).json({ error: 'Failed to negotiate' });
  }
}

// ── Express App ──

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));
app.use(express.static(publicRoot));

// Serve the Chat Client SDK browser bundle
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

// ── GitHub OAuth Routes ──

// GET /auth/config — tell the frontend whether OAuth is enabled
app.get('/auth/config', (req, res) => {
  res.json({
    oauth: OAUTH_ENABLED,
    clientId: OAUTH_ENABLED ? GITHUB_CLIENT_ID : undefined,
  });
});

// GET /auth/login — redirect to GitHub
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

// GET /auth/callback — exchange code for token, fetch user profile
app.get('/auth/callback', async (req, res) => {
  if (!OAUTH_ENABLED) return res.status(404).json({ error: oauthUnavailableMessage() });
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Invalid OAuth callback. <a href="/">Go back</a>');
  }
  delete req.session.oauthState;
  try {
    // Exchange code for access token
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
    // Fetch user profile
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

// GET /auth/me — return current user (or 401)
app.get('/auth/me', (req, res) => {
  if (!OAUTH_ENABLED) return res.json({ oauth: false });
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ oauth: true, user: req.session.user });
});

// POST /auth/logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /negotiate:portal — issue WPS Chat token for the browser portal.
// If OAuth is enabled, userId comes from session. Otherwise, from query param.
app.get(/^\/negotiate:portal$/, async (req, res) => {
  let userId;
  if (OAUTH_ENABLED) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    userId = req.session.user.login;
  } else {
    userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId query parameter is required' });
  }
  await issueTokenResponse(res, userId, { ensureLobby: true, logLabel: 'Negotiate:portal' });
});

// GET /negotiate:daemon — issue WPS Chat token for daemon/bot logins.
app.get(/^\/negotiate:daemon$/, async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }
  await issueTokenResponse(res, userId, { ensureLobby: false, logLabel: 'Negotiate:daemon' });
});

// ── Start ──

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
  } catch (e) {
    console.error('[Web] Admin chat init failed:', e.message);
  }
  console.log(`[Web] Run 'npm run daemon' to start the agent daemon.`);
});
server.on('error', (err) => {
  console.error(`[Web] Server error:`, err.message);
  process.exit(1);
});
