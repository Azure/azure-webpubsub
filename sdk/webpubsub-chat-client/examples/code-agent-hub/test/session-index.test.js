import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionListForUser,
  createSessionIndexState,
  findJoinRequestById,
  getLatestJoinRequestForUser,
  getSessionAccessLevelFromIndex,
  hydrateSessionIndices,
  markTrustedSessionDeleted,
  upsertTrustedJoinRequestState,
  upsertTrustedSessionDirectoryRecord,
  upsertTrustedSessionMembership,
} from '../session-index.js';
import { canAdminDaemonAccess, canMemberDaemonAccess } from '../daemon-acl.js';

function buildSessionTitle({
  roomName = 'Session',
  daemonId = '',
  agentName = '',
  workingDirectory = '',
  ownerUserId = '',
  createdAt = '',
  updatedAt = '',
} = {}) {
  return JSON.stringify({
    t: 'ms',
    r: roomName,
    d: daemonId,
    a: agentName,
    w: workingDirectory,
    o: ownerUserId,
    c: createdAt,
    u: updatedAt,
  });
}

function parseSessionRoomTitle(title) {
  const parsed = JSON.parse(String(title || ''));
  return {
    roomName: String(parsed.r || parsed.roomName || 'Session'),
    daemonId: String(parsed.d || parsed.daemonId || ''),
    agentName: String(parsed.a || parsed.agentName || ''),
    workingDirectory: String(parsed.w || parsed.workingDirectory || ''),
    ownerUserId: String(parsed.o || parsed.ownerUserId || ''),
    createdAt: String(parsed.c || parsed.createdAt || ''),
    updatedAt: String(parsed.u || parsed.updatedAt || ''),
  };
}

describe('session index helpers', () => {
  it('hydrates directory, membership, and join request state from managed session rooms', async () => {
    const state = createSessionIndexState();

    await hydrateSessionIndices({
      state,
      roomInfos: [{
        roomId: 'session-1',
        title: buildSessionTitle({
          roomName: 'Repo A',
          daemonId: 'daemon-a',
          agentName: 'copilot',
          workingDirectory: 'g:/repo-a',
          ownerUserId: 'owner',
          createdAt: '2026-04-11T05:00:00.000Z',
          updatedAt: '2026-04-11T05:10:00.000Z',
        }),
      }],
      parseSessionRoomTitle,
      loadSessionMembers: async () => ([
        { userId: '__portal_control__', role: 'room.operator' },
        { userId: 'daemon-a', role: 'room.member' },
        { userId: 'owner', role: 'room.operator' },
        { userId: 'reader', role: 'room.member' },
        { userId: 'writer', role: 'room.operator' },
      ]),
      loadJoinRequests: async () => ([
        {
          requestId: 'req-1',
          requesterUserId: 'pending-user',
          requestedAccess: 'write',
          status: 'pending',
          createdAt: '2026-04-11T05:09:00.000Z',
          updatedAt: '2026-04-11T05:09:00.000Z',
        },
      ]),
      adminUserId: '__portal_control__',
    });

    assert.ok(state.hydratedAt > 0);
    assert.deepEqual(state.directoryBySessionId.get('session-1'), {
      sessionId: 'session-1',
      roomName: 'Repo A',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      workingDirectory: 'g:/repo-a',
      ownerUserId: 'owner',
      createdAt: '2026-04-11T05:00:00.000Z',
      updatedAt: '2026-04-11T05:10:00.000Z',
      deletedAt: null,
    });
    assert.equal(state.membershipBySessionId.get('session-1').get('reader'), 'read');
    assert.equal(state.membershipBySessionId.get('session-1').get('writer'), 'write');
    assert.equal(getLatestJoinRequestForUser(state, 'session-1', 'pending-user')?.requestId, 'req-1');
  });

  it('preserves trusted portal updates that arrive while hydration is still running', async () => {
    const state = createSessionIndexState();

    await hydrateSessionIndices({
      state,
      roomInfos: [{
        roomId: 'session-1',
        title: buildSessionTitle({
          roomName: 'Repo A',
          daemonId: 'daemon-a',
          agentName: 'copilot',
          workingDirectory: 'g:/repo-a',
          ownerUserId: 'owner',
          createdAt: '2026-04-11T05:00:00.000Z',
          updatedAt: '2026-04-11T05:10:00.000Z',
        }),
      }],
      parseSessionRoomTitle,
      loadSessionMembers: async () => {
        upsertTrustedSessionDirectoryRecord(state, {
          sessionId: 'session-2',
          roomName: 'Repo B',
          daemonId: 'daemon-a',
          agentName: 'copilot',
          ownerUserId: 'owner',
          updatedAt: '2026-04-11T05:11:00.000Z',
        }, { source: 'portal' });
        upsertTrustedSessionMembership(state, 'session-2', 'reader', 'read', { source: 'portal' });
        return [];
      },
      loadJoinRequests: async () => [],
      adminUserId: '__portal_control__',
    });

    assert.equal(state.directoryBySessionId.has('session-1'), true);
    assert.equal(state.directoryBySessionId.has('session-2'), true);
    assert.equal(state.membershipBySessionId.get('session-2')?.get('reader'), 'read');
  });

  it('computes access level from owner, daemon admin, and session membership', () => {
    const state = createSessionIndexState();
    const sessionRecord = upsertTrustedSessionDirectoryRecord(state, {
      sessionId: 'session-1',
      roomName: 'Repo A',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      ownerUserId: 'owner',
      updatedAt: '2026-04-11T05:10:00.000Z',
    }, { source: 'portal' });
    const daemonAccessState = {
      ownerUserId: 'daemon-owner',
      adminUsers: ['daemon-admin'],
      memberUsers: ['reader'],
    };

    upsertTrustedSessionMembership(state, 'session-1', 'reader', 'read', { source: 'portal' });
    upsertTrustedSessionMembership(state, 'session-1', 'writer', 'write', { source: 'portal' });

    assert.equal(getSessionAccessLevelFromIndex({
      state,
      sessionRecord,
      daemonAccessState,
      userId: 'owner',
      canAdminDaemonAccess,
    }), 'write');
    assert.equal(getSessionAccessLevelFromIndex({
      state,
      sessionRecord,
      daemonAccessState,
      userId: 'daemon-admin',
      canAdminDaemonAccess,
    }), 'write');
    assert.equal(getSessionAccessLevelFromIndex({
      state,
      sessionRecord,
      daemonAccessState,
      userId: 'reader',
      canAdminDaemonAccess,
    }), 'read');
    assert.equal(getSessionAccessLevelFromIndex({
      state,
      sessionRecord,
      daemonAccessState,
      userId: 'writer',
      canAdminDaemonAccess,
    }), 'write');
    assert.equal(getSessionAccessLevelFromIndex({
      state,
      sessionRecord,
      daemonAccessState,
      userId: 'outsider',
      canAdminDaemonAccess,
    }), 'none');
  });

  it('keeps daemon-member-visible sessions in the list even before session access is granted', () => {
    const state = createSessionIndexState();
    upsertTrustedSessionDirectoryRecord(state, {
      sessionId: 'session-1',
      roomName: 'Repo A',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      ownerUserId: 'owner',
      updatedAt: '2026-04-11T05:10:00.000Z',
    }, { source: 'portal' });

    const sessions = buildSessionListForUser({
      state,
      daemonAccessById: new Map([['daemon-a', {
        daemon: { daemonId: 'daemon-a', online: true },
        accessState: { ownerUserId: 'owner', adminUsers: [], memberUsers: ['member-user'] },
      }]]),
      userId: 'member-user',
      canAdminDaemonAccess,
      canMemberDaemonAccess,
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, 'session-1');
    assert.equal(sessions[0].accessLevel, 'none');
    assert.equal(sessions[0].joined, false);
    assert.equal(sessions[0].canRead, false);
    assert.equal(sessions[0].canWrite, false);
    assert.equal(sessions[0].canDelete, false);
  });

  it('surfaces join request status for visible sessions even when session access is still none', () => {
    const state = createSessionIndexState();
    upsertTrustedSessionDirectoryRecord(state, {
      sessionId: 'session-1',
      roomName: 'Repo A',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      ownerUserId: 'owner',
      updatedAt: '2026-04-11T05:10:00.000Z',
    }, { source: 'portal' });
    upsertTrustedJoinRequestState(state, 'session-1', {
      requestId: 'req-1',
      requesterUserId: 'member-user',
      requestedAccess: 'read',
      status: 'pending',
      createdAt: '2026-04-11T05:09:00.000Z',
      updatedAt: '2026-04-11T05:09:00.000Z',
    }, { source: 'portal' });

    const sessions = buildSessionListForUser({
      state,
      daemonAccessById: new Map([['daemon-a', {
        daemon: { daemonId: 'daemon-a', online: true },
        accessState: { ownerUserId: 'owner', adminUsers: [], memberUsers: ['member-user'] },
      }]]),
      userId: 'member-user',
      canAdminDaemonAccess,
      canMemberDaemonAccess,
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].accessLevel, 'none');
    assert.equal(sessions[0].joinStatus, 'pending');
    assert.equal(sessions[0].joinRequestId, 'req-1');
    assert.equal(sessions[0].requestedAccess, 'read');
  });

  it('grants daemon admins write access and delete rights without extra session membership', () => {
    const state = createSessionIndexState();
    upsertTrustedSessionDirectoryRecord(state, {
      sessionId: 'session-1',
      roomName: 'Repo A',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      ownerUserId: 'owner',
      updatedAt: '2026-04-11T05:10:00.000Z',
    }, { source: 'portal' });

    const sessions = buildSessionListForUser({
      state,
      daemonAccessById: new Map([['daemon-a', {
        daemon: { daemonId: 'daemon-a', online: true },
        accessState: { ownerUserId: 'owner', adminUsers: ['daemon-admin'], memberUsers: [] },
      }]]),
      userId: 'daemon-admin',
      canAdminDaemonAccess,
      canMemberDaemonAccess,
    });

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].accessLevel, 'write');
    assert.equal(sessions[0].joined, true);
    assert.equal(sessions[0].canRead, true);
    assert.equal(sessions[0].canWrite, true);
    assert.equal(sessions[0].canDelete, true);
  });

  it('keeps the latest join request state by request id and requester', () => {
    const state = createSessionIndexState();

    upsertTrustedJoinRequestState(state, 'session-1', {
      requestId: 'req-1',
      requesterUserId: 'alice',
      requestedAccess: 'read',
      status: 'pending',
      createdAt: '2026-04-11T05:00:00.000Z',
      updatedAt: '2026-04-11T05:00:00.000Z',
    }, { source: 'portal' });
    upsertTrustedJoinRequestState(state, 'session-1', {
      requestId: 'req-1',
      requesterUserId: 'alice',
      requestedAccess: 'read',
      status: 'approved',
      createdAt: '2026-04-11T05:00:00.000Z',
      updatedAt: '2026-04-11T05:01:00.000Z',
    }, { source: 'portal' });
    upsertTrustedJoinRequestState(state, 'session-1', {
      requestId: 'req-2',
      requesterUserId: 'alice',
      requestedAccess: 'write',
      status: 'pending',
      createdAt: '2026-04-11T05:02:00.000Z',
      updatedAt: '2026-04-11T05:02:00.000Z',
    }, { source: 'portal' });
    upsertTrustedJoinRequestState(state, 'session-1', {
      requestId: 'req-3',
      requesterUserId: 'bob',
      requestedAccess: 'read',
      status: 'pending',
      createdAt: '2026-04-11T05:03:00.000Z',
      updatedAt: '2026-04-11T05:03:00.000Z',
    }, { source: 'portal' });

    assert.equal(findJoinRequestById(state, 'session-1', 'req-1')?.status, 'approved');
    assert.equal(getLatestJoinRequestForUser(state, 'session-1', 'alice')?.requestId, 'req-2');
    assert.equal(getLatestJoinRequestForUser(state, 'session-1', 'bob')?.requestId, 'req-3');
  });

  it('ignores untrusted browser-style cache updates', () => {
    const state = createSessionIndexState();
    const result = upsertTrustedSessionDirectoryRecord(state, {
      sessionId: 'session-1',
      roomName: 'Browser cache only',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      ownerUserId: 'owner',
      updatedAt: '2026-04-11T05:10:00.000Z',
    }, { source: 'browser' });

    assert.equal(result, null);
    assert.equal(state.directoryBySessionId.size, 0);
  });

  it('hides deleted sessions from the query result and clears derived state', () => {
    const state = createSessionIndexState();
    upsertTrustedSessionDirectoryRecord(state, {
      sessionId: 'session-1',
      roomName: 'Repo A',
      daemonId: 'daemon-a',
      agentName: 'copilot',
      ownerUserId: 'owner',
      updatedAt: '2026-04-11T05:10:00.000Z',
    }, { source: 'portal' });
    upsertTrustedSessionMembership(state, 'session-1', 'reader', 'read', { source: 'portal' });
    upsertTrustedJoinRequestState(state, 'session-1', {
      requestId: 'req-1',
      requesterUserId: 'reader',
      requestedAccess: 'read',
      status: 'pending',
      createdAt: '2026-04-11T05:00:00.000Z',
      updatedAt: '2026-04-11T05:00:00.000Z',
    }, { source: 'portal' });
    markTrustedSessionDeleted(state, 'session-1', '2026-04-11T05:11:00.000Z', { source: 'portal' });

    const sessions = buildSessionListForUser({
      state,
      daemonAccessById: new Map([['daemon-a', {
        daemon: { daemonId: 'daemon-a', online: true },
        accessState: { ownerUserId: 'owner', adminUsers: [], memberUsers: ['reader'] },
      }]]),
      userId: 'reader',
      canAdminDaemonAccess,
      canMemberDaemonAccess,
    });

    assert.deepEqual(sessions, []);
    assert.equal(state.membershipBySessionId.has('session-1'), false);
    assert.equal(state.joinRequestsBySessionId.has('session-1'), false);
  });
});