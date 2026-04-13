import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIncomingSessionRoomMessage,
  daemonHasAdminAccess,
  daemonHasMemberAccess,
  getCreateSessionAccessState,
  isLocalEchoMessage,
  isDaemonRecordFresh,
  normalizeDaemonRecord,
  notificationTargetsRoom,
  rememberRoomMessage,
  resetSessionStateToIdle,
  resolveNotificationRoomId,
  shouldIgnoreRoomMessage,
  shouldIgnoreSemanticDuplicate,
  shouldRetainPreviousDaemons,
} from '../public/portal-regressions.js';

describe('portal regression helpers', () => {
  it('treats daemon admin as member access for session creation', () => {
    const daemon = { daemonId: 'daemon-alpha', canWrite: true };

    assert.equal(daemonHasAdminAccess(daemon), true);
    assert.equal(daemonHasMemberAccess(daemon), true);
    assert.deepEqual(getCreateSessionAccessState(daemon), { blocked: false, readOnly: false });

    const normalized = normalizeDaemonRecord(daemon);
    assert.equal(normalized.hasAdminAccess, true);
    assert.equal(normalized.hasMemberAccess, true);
    assert.equal(normalized.canRead, true);
    assert.equal(normalized.canWrite, true);
  });

  it('dedupes live room updates by message id before timestamps', () => {
    const seenRoomMessageIds = new Set();
    rememberRoomMessage({ messageId: 'history-1', createdAt: '2026-04-10T00:00:00.000Z' }, seenRoomMessageIds);

    assert.equal(
      shouldIgnoreRoomMessage(
        { messageId: 'history-1', createdAt: '2026-04-10T00:10:00.000Z' },
        seenRoomMessageIds,
        Date.now(),
      ),
      true,
    );
    assert.equal(
      shouldIgnoreRoomMessage(
        { messageId: 'live-1', createdAt: '2026-04-10T00:00:01.000Z' },
        seenRoomMessageIds,
        Date.now(),
      ),
      false,
    );
  });

  it('distinguishes local echoes from same-user messages on another device', () => {
    assert.equal(isLocalEchoMessage({ createdBy: 'shared-user', localEcho: true }, 'shared-user'), true);
    assert.equal(isLocalEchoMessage({ createdBy: 'shared-user' }, 'shared-user'), false);
    assert.equal(isLocalEchoMessage({ createdBy: 'other-user', localEcho: true }, 'shared-user'), false);
  });

  it('falls back to timestamp filtering only for legacy messages without ids', () => {
    const historyLoadedAt = new Date('2026-04-10T00:05:00.000Z').getTime();

    assert.equal(
      shouldIgnoreRoomMessage({ createdAt: '2026-04-10T00:00:00.000Z' }, new Set(), historyLoadedAt),
      true,
    );
    assert.equal(
      shouldIgnoreRoomMessage({ createdAt: '2026-04-10T00:10:00.000Z' }, new Set(), historyLoadedAt),
      false,
    );
  });

  it('clears processing and stopping flags when the session goes idle', () => {
    const sessionState = { processing: true, pendingCount: 2, stopping: true };

    assert.equal(resetSessionStateToIdle(sessionState), sessionState);
    assert.deepEqual(sessionState, { processing: false, pendingCount: 0, stopping: false });
  });

  it('keeps the previous daemon list during a transient empty refresh', () => {
    const previousDaemons = new Map([
      ['daemon-alpha', { daemonId: 'daemon-alpha', updatedAt: '2026-04-10T00:00:00.000Z' }],
    ]);
    const now = new Date('2026-04-10T00:00:30.000Z').getTime();

    assert.equal(isDaemonRecordFresh(previousDaemons.get('daemon-alpha'), now, 90_000), true);
    assert.equal(shouldRetainPreviousDaemons(previousDaemons, [], now, 90_000), true);
    assert.equal(shouldRetainPreviousDaemons(previousDaemons, [{ daemonId: 'daemon-alpha' }], now, 90_000), false);
    assert.equal(shouldRetainPreviousDaemons(previousDaemons, [], now + 120_000, 90_000), false);
  });

  it('does not filter observer messages from the daemon bot', () => {
    // Daemon bot sends assistant.message — observer should NOT filter it
    const daemonMessage = { createdBy: 'bot-user-id', messageId: 'resp-1' };
    const observerUid = 'observer-user-123';

    // Not a local echo (different user, no localEcho flag)
    assert.equal(isLocalEchoMessage(daemonMessage, observerUid), false);

    // Not seen yet
    const seenIds = new Set();
    assert.equal(shouldIgnoreRoomMessage(daemonMessage, seenIds, 0), false);

    // After remembering, a duplicate IS filtered
    rememberRoomMessage(daemonMessage, seenIds);
    assert.equal(shouldIgnoreRoomMessage(daemonMessage, seenIds, 0), true);
  });

  it('allows interleaved chunk messages from both history and live', () => {
    // Scenario: observer receives chunk 1 live, then chunk 0 from history replay
    // Both should pass shouldIgnoreRoomMessage since they have different messageIds
    const seenIds = new Set();
    const chunk0 = { messageId: 'chunk-msg-0', createdAt: '2026-04-10T00:00:01.000Z' };
    const chunk1 = { messageId: 'chunk-msg-1', createdAt: '2026-04-10T00:00:02.000Z' };

    // Chunk 1 arrives live first
    assert.equal(shouldIgnoreRoomMessage(chunk1, seenIds, 0), false);
    rememberRoomMessage(chunk1, seenIds);

    // Chunk 0 from history — different messageId, should NOT be filtered
    assert.equal(shouldIgnoreRoomMessage(chunk0, seenIds, 0), false);
    rememberRoomMessage(chunk0, seenIds);

    // Both are now deduped on re-delivery
    assert.equal(shouldIgnoreRoomMessage(chunk0, seenIds, 0), true);
    assert.equal(shouldIgnoreRoomMessage(chunk1, seenIds, 0), true);
  });

  it('remembering local echo dedupes the subsequent server notification', () => {
    const seenIds = new Set();
    const localEcho = { messageId: 'sent-42', createdBy: 'alice', localEcho: true };
    const serverEcho = { messageId: 'sent-42', createdBy: 'alice' };

    assert.equal(isLocalEchoMessage(localEcho, 'alice'), true);
    rememberRoomMessage(localEcho, seenIds);

    // Server echo arrives — same messageId — deduped
    assert.equal(isLocalEchoMessage(serverEcho, 'alice'), false);
    assert.equal(shouldIgnoreRoomMessage(serverEcho, seenIds, 0), true);
  });

  it('observer still sees the message even after sender dedupes its echo', () => {
    const observerSeenIds = new Set();
    const serverNotification = { messageId: 'sent-42', createdBy: 'alice' };

    assert.equal(isLocalEchoMessage(serverNotification, 'bob'), false);
    assert.equal(shouldIgnoreRoomMessage(serverNotification, observerSeenIds, 0), false);
  });

  it('resolves missing room ids from the default conversation id', () => {
    const notification = {
      conversation: { conversationId: 'conversation-1' },
      message: { content: { text: JSON.stringify({ type: 'user.prompt', content: 'hello' }) } },
    };
    const roomInfos = [{ roomId: 'room-1', defaultConversationId: 'conversation-1' }];

    assert.equal(resolveNotificationRoomId(notification, roomInfos), 'room-1');
    assert.equal(notificationTargetsRoom(notification, 'room-1', roomInfos), true);
    assert.equal(notificationTargetsRoom(notification, 'room-2', roomInfos), false);
  });

  it('renders another user prompt when the live notification only carries conversationId', () => {
    const seenRoomMessageIds = new Set();
    const notification = {
      conversation: { conversationId: 'conversation-1' },
      message: {
        messageId: 'prompt-1',
        createdBy: 'alice',
        createdAt: '2026-04-10T00:00:01.000Z',
        content: { text: JSON.stringify({ type: 'user.prompt', content: 'ship it' }) },
      },
    };

    const result = classifyIncomingSessionRoomMessage(notification, {
      currentRoomId: 'room-1',
      currentUserId: 'bob',
      roomInfos: [{ roomId: 'room-1', defaultConversationId: 'conversation-1' }],
      seenRoomMessageIds,
      historyLoadedAt: 0,
    });

    assert.deepEqual(result, { action: 'render', reason: 'match', roomId: 'room-1' });
    assert.equal(seenRoomMessageIds.has('prompt-1'), true);
  });

  it('renders daemon assistant replies when the live notification only carries conversationId', () => {
    const seenRoomMessageIds = new Set();
    const notification = {
      conversation: { conversationId: 'conversation-1' },
      message: {
        messageId: 'reply-1',
        createdBy: 'bot-user-id',
        createdAt: '2026-04-10T00:00:02.000Z',
        content: { text: JSON.stringify({ type: 'assistant.message', content: 'done' }) },
      },
    };

    const result = classifyIncomingSessionRoomMessage(notification, {
      currentRoomId: 'room-1',
      currentUserId: 'observer-user',
      roomInfos: [{ roomId: 'room-1', defaultConversationId: 'conversation-1' }],
      seenRoomMessageIds,
      historyLoadedAt: 0,
    });

    assert.deepEqual(result, { action: 'render', reason: 'match', roomId: 'room-1' });
    assert.equal(seenRoomMessageIds.has('reply-1'), true);
  });

  it('still suppresses only the sender local echo when conversation fallback matches', () => {
    const seenRoomMessageIds = new Set();
    const notification = {
      conversation: { conversationId: 'conversation-1' },
      message: {
        messageId: 'echo-1',
        createdBy: 'alice',
        localEcho: true,
        content: { text: JSON.stringify({ type: 'user.prompt', content: 'draft' }) },
      },
    };

    const result = classifyIncomingSessionRoomMessage(notification, {
      currentRoomId: 'room-1',
      currentUserId: 'alice',
      roomInfos: [{ roomId: 'room-1', defaultConversationId: 'conversation-1' }],
      seenRoomMessageIds,
      historyLoadedAt: 0,
    });

    assert.deepEqual(result, { action: 'ignore', reason: 'local-echo', roomId: 'room-1' });
    assert.equal(seenRoomMessageIds.has('echo-1'), true);
  });

  it('dedupes consecutive identical assistant reasoning blocks with different ids', () => {
    const previousRender = {
      type: 'assistant.reasoning',
      content: 'Evaluating project directories',
      at: 10_000,
    };

    assert.equal(
      shouldIgnoreSemanticDuplicate(previousRender, 'assistant.reasoning', 'Evaluating   project\n\ndirectories', 12_000),
      true,
    );
    assert.equal(
      shouldIgnoreSemanticDuplicate(previousRender, 'assistant.reasoning', 'Evaluating project directories', 25_000),
      false,
    );
    assert.equal(
      shouldIgnoreSemanticDuplicate(previousRender, 'assistant.message', 'Evaluating project directories', 12_000),
      false,
    );
  });

  it('does not dedupe different assistant content', () => {
    const previousRender = {
      type: 'assistant.reasoning',
      content: 'Evaluating project directories',
      at: 10_000,
    };

    assert.equal(
      shouldIgnoreSemanticDuplicate(previousRender, 'assistant.reasoning', 'Inspecting functions directory', 12_000),
      false,
    );
  });
});