/**
 * Bot Chat client wrapper.
 *
 * Owns the connection to Web PubSub Chat (`@azure/web-pubsub-chat-client`):
 * login, reconnect with exponential backoff, room membership, message send
 * (with chunking when the payload exceeds the broker per-message limit),
 * and per-key delta debouncing.
 *
 * The factory takes only a transport-shaped contract; daemon-specific
 * concerns (delegation relay, per-session state mutations, error logging
 * topology) stay in the daemon and wrap `sendEnvelope` from outside.
 */

import { randomUUID } from 'crypto';
import { ChatClient } from '@azure/web-pubsub-chat-client';

const DEFAULT_MAX_MESSAGE_LENGTH = 4096;
const DEFAULT_DELTA_DEBOUNCE_MS = 80;
const RECONNECT_MAX_DELAY_MS = 30_000;
const CHUNK_PAYLOAD_TARGET = 3000;

function isRoomCacheMiss(error) {
  return /not\s+found\s+roomid/i.test(String(error?.message || ''));
}

export async function sendRoomPayloadWithRecovery(client, roomId, payload) {
  try {
    await client.sendToRoom(roomId, payload);
    return;
  } catch (error) {
    if (!isRoomCacheMiss(error)) throw error;
  }

  try {
    await client.getRoom?.(roomId, false);
  } catch {}

  try {
    await client.sendToRoom(roomId, payload);
    return;
  } catch (error) {
    if (!isRoomCacheMiss(error)) throw error;
  }

  try {
    await client.addUserToRoom?.(roomId, client.userId);
  } catch {}

  try {
    await client.getRoom?.(roomId, false);
  } catch {}

  await client.sendToRoom(roomId, payload);
}

export function createBotChat({
  logger,
  tokenUrlProvider,
  messageHandler,
  isShuttingDown = () => false,
  controlRoom,
  controlRoomName = 'Daemon Control',
  controlMembers = [],
  ownerLabel,
  maxMessageLength = DEFAULT_MAX_MESSAGE_LENGTH,
  deltaDebounceMs = DEFAULT_DELTA_DEBOUNCE_MS,
} = {}) {
  if (typeof tokenUrlProvider !== 'function') {
    throw new Error('createBotChat: tokenUrlProvider must be a function returning the negotiate URL');
  }
  if (typeof messageHandler !== 'function') {
    throw new Error('createBotChat: messageHandler must be a function (notification) => void');
  }

  let chat = null;
  let initPromise = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  const deltaBuffers = new Map();

  function scheduleReconnect() {
    if (isShuttingDown() || reconnectTimer || initPromise) return;
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, 1000 * (2 ** reconnectAttempt));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void ensureReady().catch((error) => {
        logger?.error?.('bot.reconnect.failed', { reconnectAttempt, error }, 'Bot reconnect failed');
        scheduleReconnect();
      });
    }, delay);
    reconnectTimer.unref?.();
  }

  async function login() {
    if (chat) return chat;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const tokenUrl = await tokenUrlProvider();
      const next = await new ChatClient(tokenUrl).login();
      logger?.info?.('bot.chat.connected', { userId: next.userId }, 'Bot chat connected');

      next.onConnected(() => { reconnectAttempt = 0; });
      next.onDisconnected(() => {
        if (isShuttingDown()) return;
        logger?.warn?.('bot.chat.disconnected', { reconnectAttempt }, 'Bot chat disconnected; scheduling reconnect');
        if (chat === next) chat = null;
        scheduleReconnect();
      });
      next.addListenerForNewMessage(messageHandler);

      if (controlRoom) {
        await ensureRoomMembership(next, controlRoom, controlRoomName, ownerLabel, controlMembers);
      }
      chat = next;
      return next;
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  }

  async function ensureReady() {
    return chat || login();
  }

  async function ensureRoomMembership(client, roomId, roomName, userId, extraUsers = []) {
    try {
      await client.createRoom(roomName, [userId, ...extraUsers].filter(Boolean), roomId);
      return;
    } catch {}
    for (const memberId of [...new Set([userId, ...extraUsers].filter(Boolean))]) {
      try {
        await client.addUserToRoom(roomId, memberId);
      } catch {}
    }
  }

  async function sendEnvelope(roomId, envelope) {
    if (isShuttingDown()) return;
    const client = await ensureReady();
    if (!client) return;
    const payload = JSON.stringify(envelope);
    if (payload.length <= maxMessageLength) {
      await sendRoomPayloadWithRecovery(client, roomId, payload);
      return;
    }
    const chunkId = randomUUID();
    const parts = [];
    let cursor = 0;
    while (cursor < payload.length) {
      let end = Math.min(payload.length, cursor + CHUNK_PAYLOAD_TARGET);
      let part = payload.slice(cursor, end);
      let chunk = { type: 'transport.chunk', chunkId, index: parts.length, total: 0, jsonPart: part };
      while (JSON.stringify(chunk).length > maxMessageLength && part.length > 1) {
        end -= 128;
        part = payload.slice(cursor, end);
        chunk.jsonPart = part;
      }
      parts.push(part);
      cursor = end;
    }
    for (let index = 0; index < parts.length; index++) {
      await sendRoomPayloadWithRecovery(client, roomId, JSON.stringify({
        type: 'transport.chunk',
        chunkId,
        index,
        total: parts.length,
        jsonPart: parts[index],
      }));
    }
  }

  function sendDelta(roomId, key, deltaContent, envelopeType = 'assistant.delta', idField = 'messageId', idValue = key) {
    let buf = deltaBuffers.get(key);
    if (!buf) {
      buf = { roomId, content: '', timer: null, envelopeType, idField, idValue };
      deltaBuffers.set(key, buf);
    }
    buf.content += deltaContent;
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      const flushed = buf.content;
      buf.content = '';
      deltaBuffers.delete(key);
      void sendEnvelope(roomId, { type: buf.envelopeType, [buf.idField]: buf.idValue, content: flushed });
    }, deltaDebounceMs);
  }

  async function flushDelta(key) {
    const buf = deltaBuffers.get(key);
    if (!buf || !buf.content) return;
    if (buf.timer) clearTimeout(buf.timer);
    deltaBuffers.delete(key);
    await sendEnvelope(buf.roomId, { type: buf.envelopeType, [buf.idField]: buf.idValue, content: buf.content });
  }

  function isConnected() {
    return Boolean(chat);
  }

  function stop() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try { chat?.stop(); } catch {}
    chat = null;
  }

  return {
    ensureReady,
    sendEnvelope,
    ensureRoomMembership: (roomId, roomName, userId, extraUsers) =>
      ensureReady().then((client) => ensureRoomMembership(client, roomId, roomName, userId, extraUsers)),
    sendDelta,
    flushDelta,
    isConnected,
    stop,
  };
}
