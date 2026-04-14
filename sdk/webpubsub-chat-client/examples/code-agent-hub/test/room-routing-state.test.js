import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectKnownRoomInfos, ensureLocalRoomInfo, rememberKnownRoomInfo } from '../public/room-routing-state.js';

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

  it('hydrates local room metadata when only server-side membership exists', async () => {
    const supplementalRoomInfos = new Map();
    let addSelfCalls = 0;
    let hasJoinedRoom = false;

    const roomInfo = await ensureLocalRoomInfo('session-2', {
      chatRooms: [],
      supplementalRoomInfos,
      hasJoinedRoom: () => hasJoinedRoom,
      getRoomInfo: async (roomId) => ({ roomId, defaultConversationId: 'conversation-2' }),
      addSelfToRoom: async () => {
        addSelfCalls += 1;
        hasJoinedRoom = true;
      },
      currentUserId: 'observer',
    });

    assert.equal(addSelfCalls, 1);
    assert.equal(roomInfo?.defaultConversationId, 'conversation-2');
    assert.equal(supplementalRoomInfos.get('session-2')?.defaultConversationId, 'conversation-2');
  });
});