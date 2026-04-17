import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canBrowseDaemonDirectories,
  classifyIncomingSessionRoomMessage,
  createSessionHistorySummary,
  daemonHasAdminAccess,
  daemonHasMemberAccess,
  getRealtimeSessionAccessPatch,
  getCreateSessionAccessState,
  getSessionListAccessPresentation,
  getSessionChatPlaceholderState,
  isDaemonAccessStateResolved,
  isLocalEchoMessage,
  isDaemonRecordFresh,
  isStartupStatusEnvelope,
  recordSessionHistoryEnvelope,
  mergeRealtimeDaemonRecord,
  normalizeDaemonRecord,
  notificationTargetsRoom,
  rememberRoomMessage,
  resetSessionStateToIdle,
  resolveNotificationRoomId,
  shouldBackgroundRetrySessionOpenError,
  shouldIgnoreRoomMessage,
  shouldIgnoreSemanticDuplicate,
  shouldSuppressSessionOpenError,
  shouldRetainPreviousDaemons,
} from '../web-portal/public/js/portal-regressions.js';

describe('portal regression helpers', () => {
  it('treats daemon admin as member access for session creation', () => {
    const daemon = { daemonId: 'daemon-alpha', canWrite: true };

    assert.equal(daemonHasAdminAccess(daemon), true);
    assert.equal(daemonHasMemberAccess(daemon), true);
    assert.equal(canBrowseDaemonDirectories(daemon), true);
    assert.deepEqual(getCreateSessionAccessState(daemon), { blocked: false, readOnly: false });

    const normalized = normalizeDaemonRecord(daemon);
    assert.equal(normalized.hasAdminAccess, true);
    assert.equal(normalized.hasMemberAccess, true);
    assert.equal(normalized.canRead, true);
    assert.equal(normalized.canWrite, true);
  });

  it('keeps directory browsing admin-only even when a daemon is member-readable', () => {
    const daemon = { daemonId: 'daemon-beta', canRead: true, canWrite: false };

    assert.equal(daemonHasMemberAccess(daemon), true);
    assert.equal(daemonHasAdminAccess(daemon), false);
    assert.equal(canBrowseDaemonDirectories(daemon), false);
    assert.deepEqual(getCreateSessionAccessState(daemon), { blocked: false, readOnly: true });
  });

  it('grants realtime session write access to daemon admins', () => {
    assert.deepEqual(
      getRealtimeSessionAccessPatch(
        { sessionId: 'session-1', ownerUserId: 'alice' },
        { currentUserId: 'bob', daemon: { daemonId: 'daemon-1', canWrite: true } },
      ),
      { accessLevel: 'write', canRead: true, canWrite: true, canDelete: true },
    );
  });

  it('grants realtime session write access to the session owner', () => {
    assert.deepEqual(
      getRealtimeSessionAccessPatch(
        { sessionId: 'session-1', ownerUserId: 'alice' },
        { currentUserId: 'alice', daemon: { daemonId: 'daemon-1', canWrite: false } },
      ),
      { accessLevel: 'write', canRead: true, canWrite: true, canDelete: true },
    );
  });

  it('does not grant realtime session access to plain daemon members', () => {
    assert.deepEqual(
      getRealtimeSessionAccessPatch(
        { sessionId: 'session-1', ownerUserId: 'alice' },
        { currentUserId: 'bob', daemon: { daemonId: 'daemon-1', canRead: true, canWrite: false } },
      ),
      {},
    );
  });

  it('separates request labels from granted-access badges for session cards', () => {
    assert.deepEqual(getSessionListAccessPresentation('read'), {
      badgeClassName: 'is-read',
      badgeLabel: 'Read Access',
      isRequestable: false,
      requestReadLabel: 'Request Read',
      requestWriteLabel: 'Request Write',
    });
    assert.deepEqual(getSessionListAccessPresentation('write'), {
      badgeClassName: 'is-write',
      badgeLabel: 'Write Access',
      isRequestable: false,
      requestReadLabel: 'Request Read',
      requestWriteLabel: 'Request Write',
    });
    assert.deepEqual(getSessionListAccessPresentation('none'), {
      badgeClassName: 'is-no-access',
      badgeLabel: 'No Access',
      isRequestable: true,
      requestReadLabel: 'Request Read',
      requestWriteLabel: 'Request Write',
    });
    assert.deepEqual(getSessionListAccessPresentation('write', { suppressGrantedAccessBadge: true }), {
      badgeClassName: '',
      badgeLabel: '',
      isRequestable: false,
      requestReadLabel: 'Request Read',
      requestWriteLabel: 'Request Write',
    });
  });

  it('treats explicit false daemon access flags as resolved access state', () => {
    assert.equal(isDaemonAccessStateResolved({ daemonId: 'daemon-alpha' }), false);
    assert.equal(isDaemonAccessStateResolved({ daemonId: 'daemon-beta', canRead: false, canWrite: false, hasMemberAccess: false, hasAdminAccess: false, canManage: false }), true);
  });

  it('suppresses startup-only live sync timeouts for sessions that are still initializing', () => {
    const summary = createSessionHistorySummary();
    recordSessionHistoryEnvelope(summary, { type: 'session.state', ready: false });
    recordSessionHistoryEnvelope(summary, { type: 'system.info', message: 'Starting GitHub Copilot (SDK)…' });

    assert.equal(
      shouldSuppressSessionOpenError(new Error('Timed out waiting for live session sync: socket not ready'), summary),
      true,
    );
  });

  it('does not suppress live sync timeouts once the session is already ready', () => {
    const summary = createSessionHistorySummary();
    recordSessionHistoryEnvelope(summary, { type: 'session.state', ready: true });

    assert.equal(
      shouldSuppressSessionOpenError(new Error('Timed out waiting for live session sync: socket not ready'), summary),
      false,
    );
  });

  it('background-retries live sync timeouts when history has already loaded', () => {
    const summary = createSessionHistorySummary();
    recordSessionHistoryEnvelope(summary, { type: 'session.state', ready: true });
    recordSessionHistoryEnvelope(summary, { type: 'assistant.message', content: 'ready' });

    assert.equal(
      shouldBackgroundRetrySessionOpenError(new Error('Timed out waiting for live session sync: socket not ready'), summary),
      true,
    );
  });

  it('does not background-retry unrelated session open errors', () => {
    const summary = createSessionHistorySummary();
    recordSessionHistoryEnvelope(summary, { type: 'assistant.message', content: 'ready' });

    assert.equal(
      shouldBackgroundRetrySessionOpenError(new Error('forbidden'), summary),
      false,
    );
  });

  it('returns a starting placeholder for initializing shared sessions', () => {
    assert.deepEqual(
      getSessionChatPlaceholderState({ agentLabel: 'GitHub Copilot (SDK)', isStarting: true, isReadOnly: false }),
      {
        kicker: 'GitHub Copilot (SDK)',
        title: 'Session is still starting',
        subtitle: 'The agent has not finished initializing yet. Keep this room open and it will become ready automatically.',
      },
    );
  });

  it('returns a read-only empty placeholder for blank shared sessions', () => {
    assert.deepEqual(
      getSessionChatPlaceholderState({ agentLabel: 'Claude Code', isReadOnly: true }),
      {
        kicker: 'Claude Code',
        title: 'No conversation yet',
        subtitle: 'This session is empty. Wait for the owner to send the first message or request write access to start it yourself.',
      },
    );
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

  it('merges realtime daemon updates without dropping local access state', () => {
    const previous = {
      daemonId: 'daemon-alpha',
      hostname: 'alpha-old',
      platform: 'windows',
      agents: ['copilot'],
      workspaces: ['c:/old'],
      hasMemberAccess: true,
      hasAdminAccess: true,
      canRead: true,
      canWrite: true,
      canManage: true,
      approverUserIds: ['owner-a'],
      accessRequestStatus: 'approved',
      requestedAccess: 'admin',
      updatedAt: '2026-04-10T00:00:00.000Z',
    };

    const merged = mergeRealtimeDaemonRecord(previous, {
      daemonId: 'daemon-alpha',
      hostname: 'alpha-new',
      agents: ['copilot', 'claude'],
      workspaces: ['c:/new'],
      updatedAt: '2026-04-10T00:01:00.000Z',
    });

    assert.equal(merged.hostname, 'alpha-new');
    assert.deepEqual(merged.agents, ['copilot', 'claude']);
    assert.deepEqual(merged.workspaces, ['c:/new']);
    assert.equal(merged.hasMemberAccess, true);
    assert.equal(merged.hasAdminAccess, true);
    assert.equal(merged.canManage, true);
    assert.deepEqual(merged.approverUserIds, ['owner-a']);
    assert.equal(merged.accessRequestStatus, 'approved');
    assert.equal(merged.requestedAccess, 'admin');
  });

  it('accepts richer realtime daemon approver updates', () => {
    const merged = mergeRealtimeDaemonRecord(
      { daemonId: 'daemon-beta', hostname: 'beta', approverUserIds: ['owner-a'] },
      { daemonId: 'daemon-beta', hostname: 'beta', approverUserIds: ['owner-a', 'alice'], updatedAt: '2026-04-10T00:01:00.000Z' },
    );

    assert.deepEqual(merged.approverUserIds, ['owner-a', 'alice']);
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

  it('resolves daemon sync notifications from daemon room metadata when only conversationId is present', () => {
    const notification = {
      conversation: { conversationId: 'daemon-sync-conversation-1' },
      message: {
        content: { text: JSON.stringify({ type: 'session.created', sessionId: 'session-1', daemonId: 'daemon-a' }) },
      },
    };
    const roomInfos = [{ roomId: 'daemon-acl-daemon-a', defaultConversationId: 'daemon-sync-conversation-1' }];

    assert.equal(resolveNotificationRoomId(notification, roomInfos), 'daemon-acl-daemon-a');
    assert.equal(notificationTargetsRoom(notification, 'daemon-acl-daemon-a', roomInfos), true);
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

  it('does not treat session.state ready=true as a startup envelope', () => {
    assert.equal(isStartupStatusEnvelope({ type: 'session.state', ready: true }), false);
    assert.equal(isStartupStatusEnvelope({ type: 'session.state', ready: false }), true);
  });

  it('does not show starting placeholder once the session is confirmed ready', () => {
    const readyState = getSessionChatPlaceholderState({
      agentLabel: 'Copilot',
      isStarting: false,
      isReadOnly: false,
    });
    assert.equal(readyState.title, 'No conversation yet');

    const startingState = getSessionChatPlaceholderState({
      agentLabel: 'Copilot',
      isStarting: true,
    });
    assert.equal(startingState.title, 'Session is still starting');
  });

  it('classifies portal.join-request in a session room as renderable for the owner', () => {
    const notification = {
      conversation: { roomId: 'session-1' },
      message: {
        messageId: 'jreq-1',
        createdBy: 'requester',
        createdAt: new Date().toISOString(),
        content: { text: JSON.stringify({ type: 'portal.join-request', requestId: 'r1', requesterUserId: 'requester', sessionId: 'session-1', status: 'pending' }) },
      },
    };
    const result = classifyIncomingSessionRoomMessage(notification, {
      currentRoomId: 'session-1',
      currentUserId: 'owner',
      roomInfos: [{ roomId: 'session-1', defaultConversationId: 'c1' }],
      seenRoomMessageIds: new Set(),
      historyLoadedAt: 0,
    });
    assert.equal(result.action, 'render');
  });

  it('daemon admin access check correctly distinguishes admin from member', () => {
    const adminDaemon = { daemonId: 'd1', canManage: true, hasAdminAccess: true, canWrite: true };
    const memberDaemon = { daemonId: 'd2', hasMemberAccess: true, canRead: true, canWrite: false };
    const noDaemon = { daemonId: 'd3' };

    assert.equal(daemonHasAdminAccess(adminDaemon), true);
    assert.equal(daemonHasAdminAccess(memberDaemon), false);
    assert.equal(daemonHasAdminAccess(noDaemon), false);

    assert.equal(daemonHasMemberAccess(adminDaemon), true);
    assert.equal(daemonHasMemberAccess(memberDaemon), true);
    assert.equal(daemonHasMemberAccess(noDaemon), false);
  });

  it('records readyState transitions correctly in session history summary', () => {
    const summary = createSessionHistorySummary();
    recordSessionHistoryEnvelope(summary, { type: 'session.state', ready: false });
    assert.equal(summary.readyState, false);
    assert.equal(summary.hasStartupSignal, true);

    recordSessionHistoryEnvelope(summary, { type: 'session.state', ready: true });
    assert.equal(summary.readyState, true);
  });

  it('treats delegation summaries as conversation content for source-room replay', () => {
    const summary = createSessionHistorySummary();

    recordSessionHistoryEnvelope(summary, {
      type: 'delegation.dispatched',
      delegationId: 'delegation-1',
      sourceSessionId: 'source-1',
      targetSessionId: 'target-1',
      relayRoomId: 'delegation-relay-delegation-1',
    });

    assert.equal(summary.envelopeCount, 1);
    assert.equal(summary.hasConversationContent, true);
    assert.equal(summary.hasSyncEvidence, false);
  });
});