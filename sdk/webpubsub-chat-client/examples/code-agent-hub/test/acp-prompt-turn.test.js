import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { finishAcpPromptTurn } from '../daemon/acp-prompt-turn.js';

describe('ACP prompt turn helpers', () => {
  it('finalizes an ACP prompt turn from the prompt response', async () => {
    const state = { isProcessing: true, isStopping: true, pendingCount: 2 };
    const calls = [];

    await finishAcpPromptTurn(state, 'room-1', {
      flushBufferedContent: async (_state, roomId) => {
        calls.push(['flushBufferedContent', roomId]);
      },
      flushCompletedToolInvocations: (roomId) => {
        calls.push(['flushCompletedToolInvocations', roomId]);
      },
      botSend: async (roomId, envelope) => {
        calls.push(['botSend', roomId, envelope]);
      },
      emitSessionState: async (roomId) => {
        calls.push(['emitSessionState', roomId]);
      },
    });

    assert.deepEqual(state, { isProcessing: false, isStopping: false, pendingCount: 0 });
    assert.deepEqual(calls, [
      ['flushBufferedContent', 'room-1'],
      ['flushCompletedToolInvocations', 'room-1'],
      ['botSend', 'room-1', { type: 'session.idle' }],
      ['emitSessionState', 'room-1'],
    ]);
  });

  it('clears ACP prompt state without emitting idle when ending on error', async () => {
    const state = { isProcessing: true, isStopping: true, pendingCount: 1 };
    const calls = [];

    await finishAcpPromptTurn(state, 'room-2', {
      emitIdle: false,
      flushBufferedContent: async (_state, roomId) => {
        calls.push(['flushBufferedContent', roomId]);
      },
      flushCompletedToolInvocations: (roomId) => {
        calls.push(['flushCompletedToolInvocations', roomId]);
      },
      botSend: async (roomId, envelope) => {
        calls.push(['botSend', roomId, envelope]);
      },
      emitSessionState: async (roomId) => {
        calls.push(['emitSessionState', roomId]);
      },
    });

    assert.deepEqual(state, { isProcessing: false, isStopping: false, pendingCount: 0 });
    assert.deepEqual(calls, [
      ['flushBufferedContent', 'room-2'],
      ['flushCompletedToolInvocations', 'room-2'],
      ['emitSessionState', 'room-2'],
    ]);
  });
});