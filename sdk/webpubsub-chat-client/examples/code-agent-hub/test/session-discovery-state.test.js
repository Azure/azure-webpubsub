import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySessionQueryContext,
  collectVisibleSessions,
  getSessionMetadataHydrationState,
  getSessionRecordStatusInfo,
  normalizeSessionRecord,
  resolveRoomDisplayName,
  sessionNeedsMetadataHydration,
  shouldShowPortalSessionLoading,
  shouldSkipDeletedSession,
} from '../public/session-discovery-state.js';

describe('session discovery state helpers', () => {
  it('shows loading only when no local session candidates exist yet', () => {
    assert.equal(shouldShowPortalSessionLoading({ queryLoaded: false, localSessionCount: 0 }), true);
    assert.equal(shouldShowPortalSessionLoading({ queryLoaded: false, localSessionCount: 1 }), false);
    assert.equal(shouldShowPortalSessionLoading({ queryLoaded: true, localSessionCount: 0 }), false);
  });

  it('shows session detail loading only for actionable or active metadata hydration work', () => {
    const now = new Date('2026-04-16T08:00:00.000Z').getTime();
    const sessions = [{
      sessionId: 'session-metadata',
      name: 'Joined Session',
      accessLevel: 'read',
      canRead: true,
      agent: '',
      workingDirectory: '',
      ownerUserId: '',
      daemonId: '',
    }];

    assert.equal(sessionNeedsMetadataHydration(sessions[0]), true);

    const actionable = getSessionMetadataHydrationState({
      sessions,
      joinedSessionIds: new Set(['session-metadata']),
      inFlightSessionIds: new Set(),
      lastAttemptBySessionId: new Map(),
      now,
      cooldownMs: 10000,
    });

    assert.equal(actionable.actionableCount, 1);
    assert.equal(actionable.inFlightCount, 0);
    assert.equal(actionable.shouldShowLoading, true);

    const coolingDown = getSessionMetadataHydrationState({
      sessions,
      joinedSessionIds: new Set(['session-metadata']),
      inFlightSessionIds: new Set(),
      lastAttemptBySessionId: new Map([['session-metadata', now - 1000]]),
      now,
      cooldownMs: 10000,
    });

    assert.equal(coolingDown.actionableCount, 0);
    assert.equal(coolingDown.inFlightCount, 0);
    assert.equal(coolingDown.shouldShowLoading, false);

    const inFlight = getSessionMetadataHydrationState({
      sessions,
      joinedSessionIds: new Set(['session-metadata']),
      inFlightSessionIds: new Set(['session-metadata']),
      lastAttemptBySessionId: new Map([['session-metadata', now - 1000]]),
      now,
      cooldownMs: 10000,
    });

    assert.equal(inFlight.actionableCount, 0);
    assert.equal(inFlight.inFlightCount, 1);
    assert.equal(inFlight.shouldShowLoading, true);
  });

  it('returns visible sessions across daemons and agents when no selection filter is active', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map([
        ['session-alpha', {
          sessionId: 'session-alpha',
          daemonId: 'daemon-a',
          agent: 'copilot',
          name: 'Alpha',
          updatedAt: '2026-04-15T05:00:00.000Z',
          canRead: true,
        }],
        ['session-beta', {
          sessionId: 'session-beta',
          daemonId: 'daemon-b',
          agent: 'claude',
          name: 'Beta',
          updatedAt: '2026-04-15T05:05:00.000Z',
          canRead: true,
        }],
      ]),
      chatRooms: [],
      deletedSessions: new Map(),
    });

    assert.deepEqual(sessions.map((session) => session.sessionId), ['session-beta', 'session-alpha']);
  });

  it('keeps matching discovered sessions visible before the portal query completes', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map([
        ['session-1', {
          sessionId: 'session-1',
          daemonId: 'daemon-a',
          agent: 'copilot',
          name: 'Repo A',
          updatedAt: '2026-04-11T05:00:00.000Z',
          canRead: true,
        }],
      ]),
      chatRooms: [],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, 'session-1');
    assert.equal(sessions[0].name, 'Repo A');
  });

  it('surfaces joined rooms as local candidates even before portal discovery catches up', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map(),
      chatRooms: [{ roomId: 'session-2', title: 'Joined Session', updatedAt: '2026-04-11T05:10:00.000Z', defaultConversationId: 'conversation-2' }],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, 'session-2');
    assert.equal(sessions[0].name, 'Joined Session');
    assert.equal(sessions[0].accessLevel, 'read');
    assert.equal(sessions[0].canRead, true);
    assert.equal(sessions[0].defaultConversationId, 'conversation-2');
  });

  it('preserves defaultConversationId across touch-style session updates', () => {
    const previous = {
      sessionId: 'session-keep-cid',
      defaultConversationId: 'conversation-keep',
      daemonId: 'daemon-a',
      agent: 'copilot',
      canRead: true,
    };

    const normalized = normalizeSessionRecord({
      sessionId: 'session-keep-cid',
      updatedAt: '2026-04-13T05:45:22.263Z',
      roomName: 'azure-sdk-for-net (copilot)',
    }, previous);

    assert.equal(normalized.defaultConversationId, 'conversation-keep');
    assert.equal(normalized.name, 'azure-sdk-for-net (copilot)');
  });

  it('ignores daemon ACL sync rooms when surfacing joined room candidates', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map(),
      chatRooms: [
        { roomId: 'daemon-acl-daemon-a', title: '{"type":"daemon-acl"}', updatedAt: '2026-04-11T05:09:00.000Z' },
        { roomId: 'session-2', title: 'Joined Session', updatedAt: '2026-04-11T05:10:00.000Z' },
      ],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.deepEqual(sessions.map((session) => session.sessionId), ['session-2']);
    assert.equal(sessions[0].name, 'Joined Session');
  });

  it('skips joined room candidates that were just deleted even if the local room cache still has them', () => {
    const now = new Date('2026-04-11T05:40:00.000Z').getTime();
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map(),
      chatRooms: [{ roomId: 'session-3', title: 'Stale Joined Session', updatedAt: '2026-04-11T05:39:00.000Z' }],
      deletedSessions: new Map([['session-3', now - 4_000]]),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
      now,
    });

    assert.deepEqual(sessions.map((session) => session.sessionId), []);
  });

  it('parses managed-session room titles for joined room candidates instead of surfacing raw title JSON', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map(),
      chatRooms: [{
        roomId: 'session-4',
        title: JSON.stringify({
          t: 'ms',
          r: 'Repo Session',
          d: 'daemon-a',
          a: 'copilot',
          w: 'g:/repo',
          o: 'alice',
          u: '2026-04-11T05:15:00.000Z',
        }),
      }],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].name, 'Repo Session');
    assert.equal(sessions[0].daemonId, 'daemon-a');
    assert.equal(sessions[0].agent, 'copilot');
    assert.equal(sessions[0].workingDirectory, 'g:/repo');
    assert.equal(sessions[0].ownerUserId, 'alice');
  });

  it('resolves managed-session room display names from raw room metadata without leaking title JSON', () => {
    const displayName = resolveRoomDisplayName({
      name: JSON.stringify({
        t: 'ms',
        r: 'Repo Session',
        d: 'daemon-a',
        a: 'copilot',
      }),
    });

    assert.equal(displayName, 'Repo Session');
  });

  it('falls back to the plain room display name when the title is not managed-session metadata', () => {
    const displayName = resolveRoomDisplayName({ name: 'Joined Session' });

    assert.equal(displayName, 'Joined Session');
  });

  it('filters parsed managed-session joined rooms by daemon and agent metadata', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map(),
      chatRooms: [{
        roomId: 'session-5',
        title: JSON.stringify({
          t: 'ms',
          r: 'Other Session',
          d: 'daemon-b',
          a: 'claude',
        }),
      }],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.deepEqual(sessions, []);
  });

  it('filters out sessions from other daemon or agent while preserving joined rooms with missing metadata', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map([
        ['session-a', {
          sessionId: 'session-a',
          daemonId: 'daemon-b',
          agent: 'copilot',
          name: 'Wrong daemon',
          updatedAt: '2026-04-11T05:00:00.000Z',
          canRead: true,
        }],
        ['session-b', {
          sessionId: 'session-b',
          daemonId: 'daemon-a',
          agent: 'claude',
          name: 'Wrong agent',
          updatedAt: '2026-04-11T05:01:00.000Z',
          canRead: true,
        }],
      ]),
      chatRooms: [{ roomId: 'session-c', title: 'Joined fallback', updatedAt: '2026-04-11T05:02:00.000Z' }],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.deepEqual(sessions.map((session) => session.sessionId), ['session-c']);
  });

  it('keeps portal-discovered sessions visible when the current query already scopes daemon and agent', () => {
    const scopedSession = applySessionQueryContext({
      sessionId: 'session-query-scoped',
      roomName: 'Shared Session',
      updatedAt: '2026-04-15T05:02:00.000Z',
      accessLevel: 'read',
    }, {
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    const sessions = collectVisibleSessions({
      discoveredSessions: new Map([
        ['session-query-scoped', normalizeSessionRecord(scopedSession)],
      ]),
      chatRooms: [],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, 'session-query-scoped');
    assert.equal(sessions[0].daemonId, 'daemon-a');
    assert.equal(sessions[0].agent, 'copilot');
    assert.equal(sessions[0].name, 'Shared Session');
  });

  it('orders visible sessions by most recent update time', () => {
    const sessions = collectVisibleSessions({
      discoveredSessions: new Map([
        ['session-old', {
          sessionId: 'session-old',
          daemonId: 'daemon-a',
          agent: 'copilot',
          name: 'Older',
          updatedAt: '2026-04-11T05:00:00.000Z',
          canRead: true,
        }],
        ['session-new', {
          sessionId: 'session-new',
          daemonId: 'daemon-a',
          agent: 'copilot',
          name: 'Newer',
          updatedAt: '2026-04-11T05:30:00.000Z',
          canRead: true,
        }],
      ]),
      chatRooms: [],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.deepEqual(sessions.map((session) => session.sessionId), ['session-new', 'session-old']);
  });

  it('preserves daemon sync status flags so observer session cards can show working state', () => {
    const previous = normalizeSessionRecord({
      sessionId: 'session-status',
      daemonId: 'daemon-a',
      agent: 'copilot-sdk',
      name: 'Shared Copilot Session',
      updatedAt: '2026-04-14T05:00:00.000Z',
      canRead: true,
      canWrite: true,
    });

    const touched = normalizeSessionRecord({
      sessionId: 'session-status',
      updatedAt: '2026-04-14T05:01:00.000Z',
      sessionProcessing: true,
      sessionStopping: false,
      sessionReady: true,
      sessionDelegating: true,
    }, previous);

    assert.equal(touched.sessionProcessing, true);
    assert.equal(touched.sessionStopping, false);
    assert.equal(touched.sessionReady, true);
    assert.equal(touched.sessionDelegating, true);

    const sessions = collectVisibleSessions({
      discoveredSessions: new Map([['session-status', touched]]),
      chatRooms: [],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot-sdk',
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionProcessing, true);
    assert.equal(sessions[0].sessionStopping, false);
    assert.equal(sessions[0].sessionReady, true);
    assert.equal(sessions[0].sessionDelegating, true);
  });

  it('derives visible session status for daemon members even before session access is granted', () => {
    const workingSession = normalizeSessionRecord({
      sessionId: 'session-status-working',
      daemonId: 'daemon-a',
      agent: 'copilot-sdk',
      name: 'Shared Session',
      accessLevel: 'none',
      canRead: false,
      canWrite: false,
      sessionProcessing: true,
    });

    assert.deepEqual(getSessionRecordStatusInfo(workingSession), {
      state: 'working',
      label: 'Working',
    });

    const idleSession = normalizeSessionRecord({
      sessionId: 'session-status-idle',
      daemonId: 'daemon-a',
      agent: 'copilot-sdk',
      name: 'Shared Session',
      accessLevel: 'none',
      canRead: false,
      canWrite: false,
    });

    assert.deepEqual(getSessionRecordStatusInfo(idleSession), {
      state: 'idle',
      label: 'Idle',
    });
  });

  it('treats active delegation as working even when the source session is otherwise idle', () => {
    const delegatingSession = normalizeSessionRecord({
      sessionId: 'session-status-delegating',
      daemonId: 'daemon-a',
      agent: 'copilot-sdk',
      name: 'Shared Session',
      accessLevel: 'none',
      canRead: false,
      canWrite: false,
      sessionDelegating: true,
    });

    assert.deepEqual(getSessionRecordStatusInfo(delegatingSession), {
      state: 'working',
      label: 'Working',
    });
  });

  it('keeps recently deleted sessions from being reintroduced immediately', () => {
    const now = new Date('2026-04-11T05:40:00.000Z').getTime();
    const deletedSessions = new Map([
      ['session-3', now - 4_000],
      ['session-4', now - 6_000],
    ]);

    assert.equal(shouldSkipDeletedSession('session-3', deletedSessions, now, 5_000), true);
    assert.equal(shouldSkipDeletedSession('session-4', deletedSessions, now, 5_000), false);
    assert.equal(shouldSkipDeletedSession('session-5', deletedSessions, now, 5_000), false);
  });
});