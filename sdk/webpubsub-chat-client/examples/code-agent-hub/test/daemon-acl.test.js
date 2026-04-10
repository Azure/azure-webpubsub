import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDaemonAclRoomTitle,
  buildDesiredDaemonAclMembers,
  canAdminDaemonAccess,
  canMemberDaemonAccess,
  canReadDaemonAccess,
  canManageDaemonAccess,
  canWriteDaemonAccess,
  daemonAclRoomId,
  deriveDaemonAclState,
  parseDaemonAclRoomTitle,
} from '../daemon-acl.js';

describe('daemon-acl helpers', () => {
  it('should round-trip daemon ACL room metadata', () => {
    const title = buildDaemonAclRoomTitle({
      daemonId: 'copilot-bot',
      ownerUserId: 'admin',
      hostname: 'dev-box',
      platform: 'win32',
      agents: ['copilot', 'claude'],
      workspaces: ['g:/repo'],
      online: true,
      updatedAt: '2026-04-09T00:00:00.000Z',
      lastSeenAt: '2026-04-09T00:00:00.000Z',
    });

    assert.equal(daemonAclRoomId('copilot-bot'), 'daemon-acl-copilot-bot');
    assert.deepEqual(parseDaemonAclRoomTitle(title), {
      daemonId: 'copilot-bot',
      ownerUserId: 'admin',
      hostname: 'dev-box',
      platform: 'win32',
      agents: ['copilot', 'claude'],
      workspaces: ['g:/repo'],
      online: true,
      updatedAt: '2026-04-09T00:00:00.000Z',
      lastSeenAt: '2026-04-09T00:00:00.000Z',
    });
  });

  it('should build desired members with writer precedence and deduplication', () => {
    const desired = buildDesiredDaemonAclMembers({
      ownerUserId: 'admin',
      memberUsers: ['alice', 'bob', 'operator', 'alice'],
      adminUsers: ['operator', 'admin', '__portal_control__'],
      adminUserId: '__portal_control__',
    });

    assert.deepEqual(desired, [
      { userId: 'admin', role: 'room.operator' },
      { userId: 'operator', role: 'room.operator' },
      { userId: 'alice', role: 'room.member' },
      { userId: 'bob', role: 'room.member' },
    ]);
  });

  it('should derive owner, admins, and members from room membership', () => {
    const accessState = deriveDaemonAclState({
      daemonId: 'copilot-bot',
      roomTitle: buildDaemonAclRoomTitle({ daemonId: 'copilot-bot', ownerUserId: 'admin' }),
      members: [
        { userId: '__portal_control__', role: 'room.operator' },
        { userId: 'admin', role: 'room.operator' },
        { userId: 'operator', role: 'room.operator' },
        { userId: 'alice', role: 'room.member' },
        { userId: 'bob', role: 'custom.role' },
      ],
      adminUserId: '__portal_control__',
    });

    assert.equal(accessState.ownerUserId, 'admin');
    assert.deepEqual(accessState.adminUsers, ['operator']);
    assert.deepEqual(accessState.memberUsers, ['alice', 'bob']);
    assert.equal(canManageDaemonAccess(accessState, 'admin'), true);
    assert.equal(canManageDaemonAccess(accessState, 'operator'), true);
    assert.equal(canAdminDaemonAccess(accessState, 'operator'), true);
    assert.equal(canWriteDaemonAccess(accessState, 'operator'), true);
    assert.equal(canMemberDaemonAccess(accessState, 'alice'), true);
    assert.equal(canReadDaemonAccess(accessState, 'alice'), true);
    assert.equal(canReadDaemonAccess(accessState, 'operator'), true);
    assert.equal(canReadDaemonAccess(accessState, 'eve'), false);
  });

  it('should fall back to the first operator when room metadata is missing', () => {
    const accessState = deriveDaemonAclState({
      daemonId: 'copilot-bot',
      roomTitle: 'legacy-room-title',
      members: [
        { userId: '__portal_control__', role: 'room.operator' },
        { userId: 'owner', role: 'room.operator' },
        { userId: 'alice', role: 'room.member' },
      ],
      adminUserId: '__portal_control__',
    });

    assert.equal(accessState.ownerUserId, 'owner');
    assert.deepEqual(accessState.adminUsers, []);
    assert.deepEqual(accessState.memberUsers, ['alice']);
  });
});