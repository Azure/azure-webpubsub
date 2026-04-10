import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForJoinedRoom, waitForRoomLiveSync } from '../public/session-live-sync.js';

describe('session live sync helpers', () => {
  it('does not treat room info fetch as a completed live-room join', async () => {
    let joined = false;
    let hydrateCalls = 0;

    await waitForJoinedRoom('room-1', {
      hasJoinedRoom: () => joined,
      getRoomInfo: async () => ({ roomId: 'room-1' }),
      hydrateJoinedRoom: async () => {
        hydrateCalls += 1;
        if (hydrateCalls === 2) {
          joined = true;
        }
      },
      timeoutMs: 50,
      pollIntervalMs: 1,
    });

    assert.equal(hydrateCalls, 2);
    assert.equal(joined, true);
  });

  it('fails fast instead of silently continuing when live join never materializes', async () => {
    await assert.rejects(
      waitForJoinedRoom('room-2', {
        hasJoinedRoom: () => false,
        getRoomInfo: async () => ({ roomId: 'room-2' }),
        hydrateJoinedRoom: async () => {
          throw new Error('forbidden');
        },
        timeoutMs: 10,
        pollIntervalMs: 1,
      }),
      /Timed out waiting for room membership: forbidden/,
    );
  });

  it('returns immediately when the room is already joined', async () => {
    let getRoomCalls = 0;
    let hydrateCalls = 0;

    await waitForJoinedRoom('room-3', {
      hasJoinedRoom: () => true,
      getRoomInfo: async () => {
        getRoomCalls += 1;
        return { roomId: 'room-3' };
      },
      hydrateJoinedRoom: async () => {
        hydrateCalls += 1;
      },
      timeoutMs: 10,
      pollIntervalMs: 1,
    });

    assert.equal(getRoomCalls, 0);
    assert.equal(hydrateCalls, 0);
  });

  it('waits for a daemon sync acknowledgement before treating the room as live', async () => {
    const listeners = new Set();
    let syncRequests = 0;

    await waitForRoomLiveSync('room-4', {
      subscribeToMessages: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      sendSyncRequest: async (roomId) => {
        syncRequests += 1;
        if (syncRequests === 2) {
          for (const listener of listeners) {
            listener({
              conversation: { roomId },
              message: { content: { text: JSON.stringify({ type: 'session.state' }) } },
            });
          }
        }
      },
      messageHasSyncEvidence: (roomId, notification) => {
        if (notification?.conversation?.roomId !== roomId) {
          return false;
        }

        return JSON.parse(notification.message.content.text).type === 'session.state';
      },
      timeoutMs: 50,
      retryIntervalMs: 1,
    });

    assert.equal(syncRequests, 2);
    assert.equal(listeners.size, 0);
  });

  it('ignores unrelated room messages while waiting for live sync evidence', async () => {
    const listeners = new Set();
    let syncRequests = 0;

    await waitForRoomLiveSync('room-5', {
      subscribeToMessages: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      sendSyncRequest: async () => {
        syncRequests += 1;
        for (const listener of listeners) {
          listener({
            conversation: { roomId: 'other-room' },
            message: { content: { text: JSON.stringify({ type: 'session.state' }) } },
          });
          listener({
            conversation: { roomId: 'room-5' },
            message: { content: { text: JSON.stringify({ type: 'transport.chunk' }) } },
          });
          if (syncRequests === 2) {
            listener({
              conversation: { roomId: 'room-5' },
              message: { content: { text: JSON.stringify({ type: 'assistant.message' }) } },
            });
          }
        }
      },
      messageHasSyncEvidence: (roomId, notification) => {
        if (notification?.conversation?.roomId !== roomId) {
          return false;
        }

        const type = JSON.parse(notification.message.content.text).type;
        return type === 'session.state' || type === 'assistant.message';
      },
      timeoutMs: 50,
      retryIntervalMs: 1,
    });

    assert.equal(syncRequests, 2);
    assert.equal(listeners.size, 0);
  });

  it('fails fast when live sync evidence never arrives', async () => {
    await assert.rejects(
      waitForRoomLiveSync('room-6', {
        subscribeToMessages: () => () => {},
        sendSyncRequest: async () => {
          throw new Error('socket not ready');
        },
        messageHasSyncEvidence: () => false,
        timeoutMs: 10,
        retryIntervalMs: 1,
      }),
      /Timed out waiting for live session sync: socket not ready/,
    );
  });
});