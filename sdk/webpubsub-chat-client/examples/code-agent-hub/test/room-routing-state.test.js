import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectKnownRoomInfos, ensureLocalRoomInfo, rememberKnownRoomInfo } from '../web-portal/public/js/room-routing-state.js';

describe('room routing state helpers', () => {
  it('dedupes chat, supplemental, and current-session room metadata by room id', () => {
    const supplementalRoomInfos = new Map();
    rememberKnownRoomInfo(supplementalRoomInfos, { roomId: 'daemon-acl-daemon-a', defaultConversationId: 'daemon-conversation' });

    const roomInfos = collectKnownRoomInfos({
      chatRooms: [
        { roomId: 'session-1', defaultConversationId: 'conversation-1' },
        { roomId: 'daemon-acl-daemon-a', defaultConversationId: 'stale-daemon-conversation' },
      ],
      supplementalRoomInfos,
      currentSession: { sessionId: 'session-1', defaultConversationId: 'conversation-1', ownerUserId: 'alice' },
    });

    assert.deepEqual(
      roomInfos.map((roomInfo) => roomInfo.roomId || roomInfo.sessionId),
      ['session-1', 'daemon-acl-daemon-a'],
    );
    assert.equal(roomInfos.find((roomInfo) => (roomInfo.roomId || roomInfo.sessionId) === 'daemon-acl-daemon-a')?.defaultConversationId, 'daemon-conversation');
  });

  it('reuses readable server-side room metadata without attempting a self-invite', async () => {
    const supplementalRoomInfos = new Map();
    let addSelfCalls = 0;

    const roomInfo = await ensureLocalRoomInfo('session-2', {
      chatRooms: [],
      supplementalRoomInfos,
      hasJoinedRoom: () => false,
      getRoomInfo: async (roomId) => ({ roomId, defaultConversationId: 'conversation-2' }),
      addSelfToRoom: async () => {
        addSelfCalls += 1;
        throw new Error('The helper should not self-invite when getRoom succeeds');
      },
      currentUserId: 'observer',
    });

    assert.equal(addSelfCalls, 0);
    assert.equal(roomInfo?.defaultConversationId, 'conversation-2');
    assert.equal(supplementalRoomInfos.get('session-2')?.defaultConversationId, 'conversation-2');
  });

  it('falls back to self-add when room metadata is not readable yet', async () => {
    const supplementalRoomInfos = new Map();
    let addSelfCalls = 0;
    let joinedAfterAdd = false;

    const roomInfo = await ensureLocalRoomInfo('session-2', {
      chatRooms: [],
      supplementalRoomInfos,
      hasJoinedRoom: () => joinedAfterAdd,
      getRoomInfo: async (roomId) => {
        if (!joinedAfterAdd) {
          throw new Error('not a member of the specified room');
        }
        return { roomId, defaultConversationId: 'conversation-2' };
      },
      addSelfToRoom: async () => {
        addSelfCalls += 1;
        joinedAfterAdd = true;
      },
      currentUserId: 'observer',
    });

    assert.equal(addSelfCalls, 1);
    assert.equal(roomInfo?.defaultConversationId, 'conversation-2');
    assert.equal(supplementalRoomInfos.get('session-2')?.defaultConversationId, 'conversation-2');
  });

  it('suppresses already-a-member errors during self-add without throwing', async () => {
    const supplementalRoomInfos = new Map();

    const roomInfo = await ensureLocalRoomInfo('daemon-acl-test', {
      chatRooms: [],
      supplementalRoomInfos,
      hasJoinedRoom: () => false,
      getRoomInfo: async (roomId) => ({ roomId, defaultConversationId: 'daemon-conv' }),
      addSelfToRoom: async () => {
        throw new Error('User is already a member of the specified room');
      },
      currentUserId: 'admin',
    });

    assert.equal(roomInfo?.roomId, 'daemon-acl-test');
    assert.equal(supplementalRoomInfos.has('daemon-acl-test'), true);
  });

  it('throws non-membership errors from addSelfToRoom', async () => {
    await assert.rejects(
      ensureLocalRoomInfo('room-fail', {
        chatRooms: [],
        supplementalRoomInfos: new Map(),
        hasJoinedRoom: () => false,
        getRoomInfo: async () => {
          throw new Error('not a member of the specified room');
        },
        addSelfToRoom: async () => {
          throw new Error('forbidden');
        },
        currentUserId: 'user',
      }),
      /forbidden/,
    );
  });
});