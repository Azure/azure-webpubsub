import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSessionOpenSync, waitForJoinedRoom, waitForRoomLiveSync } from '../public/session-live-sync.js';

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

  it('accepts history-based sync evidence when live delivery lags behind', async () => {
    let syncRequests = 0;
    let historyChecks = 0;

    await waitForRoomLiveSync('room-7', {
      subscribeToMessages: () => () => {},
      sendSyncRequest: async () => {
        syncRequests += 1;
      },
      messageHasSyncEvidence: () => false,
      checkHistoryForSyncEvidence: async () => {
        historyChecks += 1;
        return syncRequests >= 2;
      },
      timeoutMs: 50,
      retryIntervalMs: 1,
    });

    assert.equal(syncRequests, 2);
    assert.ok(historyChecks >= 2);
  });

  it('skips the live sync wait when the initial history replay already has sync evidence', async () => {
    let liveWaitCalls = 0;
    let waitingBannerCalls = 0;

    const result = await ensureSessionOpenSync('room-8', {
      replayHistory: async (roomId, sessionMeta, historyOptions) => {
        assert.equal(roomId, 'room-8');
        assert.equal(sessionMeta.sessionId, 'room-8');
        assert.deepEqual(historyOptions, { maxCount: 100, skipStartupEnvelopes: true });
        return true;
      },
      waitForLiveState: async () => {
        liveWaitCalls += 1;
      },
      sessionMeta: { sessionId: 'room-8' },
      timeoutMs: 5000,
      historyOptions: { maxCount: 100, skipStartupEnvelopes: true },
      hasLiveRoomJoin: () => true,
      onWaitingForLiveState: () => {
        waitingBannerCalls += 1;
      },
    });

    assert.deepEqual(result, { historyHasSyncEvidence: true });
    assert.equal(liveWaitCalls, 0);
    assert.equal(waitingBannerCalls, 0);
  });

  it('waits for live sync when history has evidence but the room is not live-joined yet', async () => {
    const calls = [];

    const result = await ensureSessionOpenSync('room-8b', {
      replayHistory: async () => {
        calls.push('history');
        return true;
      },
      waitForLiveState: async (roomId, timeoutMs, sessionMeta) => {
        calls.push({ type: 'live', roomId, timeoutMs, sessionId: sessionMeta.sessionId });
      },
      sessionMeta: { sessionId: 'room-8b' },
      timeoutMs: 3210,
      hasLiveRoomJoin: () => false,
      onWaitingForLiveState: () => {
        calls.push('banner');
      },
    });

    assert.deepEqual(result, { historyHasSyncEvidence: false });
    assert.deepEqual(calls, [
      'history',
      'banner',
      { type: 'live', roomId: 'room-8b', timeoutMs: 3210, sessionId: 'room-8b' },
    ]);
  });

  it('falls through to live sync when the initial history replay has no sync evidence', async () => {
    const calls = [];

    const result = await ensureSessionOpenSync('room-9', {
      replayHistory: async (roomId, sessionMeta, historyOptions) => {
        calls.push({ type: 'history', roomId, sessionId: sessionMeta.sessionId, historyOptions });
        return false;
      },
      waitForLiveState: async (roomId, timeoutMs, sessionMeta) => {
        calls.push({ type: 'live', roomId, timeoutMs, sessionId: sessionMeta.sessionId });
      },
      sessionMeta: { sessionId: 'room-9' },
      timeoutMs: 4321,
      historyOptions: { maxCount: 25, skipStartupEnvelopes: false },
      onWaitingForLiveState: () => {
        calls.push({ type: 'banner' });
      },
    });

    assert.deepEqual(result, { historyHasSyncEvidence: false });
    assert.deepEqual(calls, [
      { type: 'history', roomId: 'room-9', sessionId: 'room-9', historyOptions: { maxCount: 25, skipStartupEnvelopes: false } },
      { type: 'banner' },
      { type: 'live', roomId: 'room-9', timeoutMs: 4321, sessionId: 'room-9' },
    ]);
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