import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectVisibleSessions,
  resolveRoomDisplayName,
  shouldShowPortalSessionLoading,
  shouldSkipDeletedSession,
} from '../public/session-discovery-state.js';

describe('session discovery state helpers', () => {
  it('shows loading only when no local session candidates exist yet', () => {
    assert.equal(shouldShowPortalSessionLoading({ queryLoaded: false, localSessionCount: 0 }), true);
    assert.equal(shouldShowPortalSessionLoading({ queryLoaded: false, localSessionCount: 1 }), false);
    assert.equal(shouldShowPortalSessionLoading({ queryLoaded: true, localSessionCount: 0 }), false);
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
      chatRooms: [{ roomId: 'session-2', title: 'Joined Session', updatedAt: '2026-04-11T05:10:00.000Z' }],
      deletedSessions: new Map(),
      currentDaemonId: 'daemon-a',
      currentAgentName: 'copilot',
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, 'session-2');
    assert.equal(sessions[0].name, 'Joined Session');
    assert.equal(sessions[0].accessLevel, 'read');
    assert.equal(sessions[0].canRead, true);
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