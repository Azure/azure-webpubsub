import express from 'express';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { ChatClient } from '@azure/web-pubsub-chat-client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ──

const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING || process.env.WebPubSubConnectionString;
if (!connectionString) {
  console.error('Error: WEB_PUBSUB_CONNECTION_STRING or WebPubSubConnectionString environment variable is required');
  process.exit(1);
}

const hubName = process.env.WEB_PUBSUB_HUB || 'chat';
const port = parseInt(process.env.PORT || '3000', 10);
const LOBBY_ROOM = 'lobby';
const ADMIN_USER_ID = 'admin';
const handledMembershipGrants = new Set();

// ── Web PubSub Service Client ──

const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

// ── Admin ChatClient (for room management) ──

let adminChat = null;

function isAlreadyMemberError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('already') || message.includes('exists') || message.includes('member');
}

async function sendLobbyEnvelope(envelope) {
  if (!adminChat) return;
  await adminChat.sendToRoom(LOBBY_ROOM, JSON.stringify(envelope));
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
  if (handledMembershipGrants.has(key)) return;
  handledMembershipGrants.add(key);
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
  } finally {
    setTimeout(() => handledMembershipGrants.delete(key), 5000);
  }
}

async function ensureLobbyAccess(userId) {
  if (!userId) return;
  if (!adminChat) {
    await initAdminChat();
  }
  try {
    await adminChat.createRoom('Agent Lobby', [ADMIN_USER_ID, String(userId)], LOBBY_ROOM);
    return;
  } catch {}
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
  adminChat.addListenerForNewMessage(async (notification) => {
    try {
      const roomId = notification.conversation?.roomId;
      const message = notification.message;
      if (roomId !== LOBBY_ROOM || message?.createdBy === ADMIN_USER_ID || !message?.content?.text) return;
      const envelope = JSON.parse(message.content.text);
      if (envelope.type === 'session.create_request') {
        await handleCreateSessionRequest(envelope);
        return;
      }
      if (envelope.type === 'session.join_response') {
        await handleApprovedJoinResponse(envelope);
      }
    } catch (error) {
      console.error('[Web] Admin listener error:', error?.message || error);
    }
  });
}

async function initAdminChat() {
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
}

// ── Express App ──

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Serve the Chat Client SDK browser bundle
app.get('/chat-client.js', (req, res) => {
  const sdkPath = join(__dirname, '..', '..', 'dist', 'browser', 'index.js');
  res.type('application/javascript').sendFile(sdkPath);
});

app.get('/marked.js', (req, res) => {
  const markedPath = join(__dirname, 'node_modules', 'marked', 'lib', 'marked.esm.js');
  res.type('application/javascript').sendFile(markedPath);
});

// GET /negotiate?userId=xxx — issue token only
app.get('/negotiate', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }
  try {
    await ensureLobbyAccess(String(userId));
    const token = await serviceClient.getClientAccessToken({ userId: String(userId) });
    res.json({ url: token.url });
  } catch (err) {
    console.error('[Negotiate] Error:', err);
    res.status(500).json({ error: 'Failed to negotiate' });
  }
});

// ── Start ──

process.on('uncaughtException', (err) => {
  console.error('[Web] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[Web] Unhandled rejection:', err);
});

const server = app.listen(port, async () => {
  console.log(`[Web] Ready at http://localhost:${port}`);
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
