import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendRoomPayloadWithRecovery } from '../daemon/bot-chat.js';

describe('bot chat room send recovery', () => {
  it('retries after hydrating room info when sendToRoom only misses the local room cache', async () => {
    const callOrder = [];
    let sendAttempts = 0;
    const client = {
      userId: 'daemon-a',
      async sendToRoom(roomId, payload) {
        callOrder.push(`send:${roomId}:${payload}`);
        sendAttempts += 1;
        if (sendAttempts < 3) {
          throw new Error(`Failed to sendToRoom, not found roomId ${roomId}`);
        }
      },
      async getRoom(roomId, useCache) {
        callOrder.push(`get:${roomId}:${useCache}`);
        return { roomId, defaultConversationId: 'conversation-1' };
      },
      async addUserToRoom(roomId, userId) {
        callOrder.push(`join:${roomId}:${userId}`);
      },
    };

    await sendRoomPayloadWithRecovery(client, 'daemon-acl-daemon-a', '{"type":"session.touch"}');

    assert.equal(sendAttempts, 3);
    assert.deepEqual(callOrder, [
      'send:daemon-acl-daemon-a:{"type":"session.touch"}',
      'get:daemon-acl-daemon-a:false',
      'send:daemon-acl-daemon-a:{"type":"session.touch"}',
      'join:daemon-acl-daemon-a:daemon-a',
      'get:daemon-acl-daemon-a:false',
      'send:daemon-acl-daemon-a:{"type":"session.touch"}',
    ]);
  });

  it('does not hide non-cache send failures behind recovery', async () => {
    const client = {
      userId: 'daemon-a',
      async sendToRoom() {
        throw new Error('forbidden');
      },
      async getRoom() {
        throw new Error('should not be called');
      },
      async addUserToRoom() {
        throw new Error('should not be called');
      },
    };

    await assert.rejects(
      sendRoomPayloadWithRecovery(client, 'daemon-acl-daemon-a', '{"type":"session.touch"}'),
      /forbidden/,
    );
  });
});