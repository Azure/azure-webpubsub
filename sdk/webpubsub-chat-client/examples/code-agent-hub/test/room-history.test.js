import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRoomHistoryPermissionError,
  listRoomMessagesWithFallback,
  normalizeMessagePage,
} from '../room-history.js';

describe('room history fallback helpers', () => {
  it('detects room-history permission failures', () => {
    assert.equal(isRoomHistoryPermissionError(new Error('NoPermissionInRoom: missing read history permission')), true);
    assert.equal(isRoomHistoryPermissionError({ statusCode: 403, message: 'Forbidden' }), true);
    assert.equal(isRoomHistoryPermissionError(new Error('socket disconnected')), false);
  });

  it('normalizes nextLink pagination payloads', () => {
    const page = normalizeMessagePage({
      value: [{ messageId: '1' }],
      nextLink: 'https://service.example/messages?start=10&end=5',
    }, 'https://service.example');

    assert.deepEqual(page.messages, [{ messageId: '1' }]);
    assert.deepEqual(page.nextQuery, { start: '10', end: '5' });
  });

  it('falls back to conversation history when room history is forbidden', async () => {
    let roomInfoCalls = 0;
    const conversationCalls = [];

    const messages = await listRoomMessagesWithFallback({
      roomId: 'room-1',
      maxCount: 3,
      baseUrl: 'https://service.example',
      loadPrimaryPage: async () => {
        const error = new Error('NoPermissionInRoom: missing read history permission');
        error.statusCode = 403;
        throw error;
      },
      loadRoomInfo: async (roomId) => {
        roomInfoCalls += 1;
        assert.equal(roomId, 'room-1');
        return { defaultConversationId: 'conversation-1' };
      },
      loadConversationPage: async (conversationId, startId, endId, pageSize) => {
        conversationCalls.push({ conversationId, startId, endId, pageSize });
        if (conversationCalls.length === 1) {
          return {
            value: [{ messageId: '3' }, { messageId: '2' }],
            nextLink: 'https://service.example/messages?start=2&end=0',
          };
        }
        return {
          messages: [{ messageId: '1' }],
          nextQuery: null,
        };
      },
    });

    assert.deepEqual(messages.map((message) => message.messageId), ['3', '2', '1']);
    assert.equal(roomInfoCalls, 1);
    assert.deepEqual(conversationCalls, [
      { conversationId: 'conversation-1', startId: null, endId: null, pageSize: 3 },
      { conversationId: 'conversation-1', startId: '2', endId: '0', pageSize: 1 },
    ]);
  });

  it('rethrows the original permission error when no fallback conversation exists', async () => {
    await assert.rejects(
      listRoomMessagesWithFallback({
        roomId: 'room-2',
        maxCount: 1,
        baseUrl: 'https://service.example',
        loadPrimaryPage: async () => {
          throw new Error('NoPermissionInRoom');
        },
        loadRoomInfo: async () => ({ defaultConversationId: '' }),
        loadConversationPage: async () => ({ messages: [] }),
      }),
      /NoPermissionInRoom/,
    );
  });
});