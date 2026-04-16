import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampDelegationRelayHistoryMaxCount,
  createDelegationRelayConnectionPromise,
} from '../public/delegation-relay-state.js';

describe('delegation relay state helpers', () => {
  it('clamps relay replay maxCount to the chat-supported range', () => {
    assert.equal(clampDelegationRelayHistoryMaxCount(120), 100);
    assert.equal(clampDelegationRelayHistoryMaxCount(0), 1);
    assert.equal(clampDelegationRelayHistoryMaxCount(17), 17);
    assert.equal(clampDelegationRelayHistoryMaxCount(Number.NaN), 100);
  });

  it('invokes the connection task and finalizer on success', async () => {
    const events = [];

    const result = await createDelegationRelayConnectionPromise(async () => {
      events.push('connect');
      return 'connected';
    }, {
      onFinally: () => events.push('finally'),
    });

    assert.equal(result, 'connected');
    assert.deepEqual(events, ['connect', 'finally']);
  });

  it('captures connection failures without throwing and still runs cleanup', async () => {
    const events = [];
    const failure = new Error('relay subscribe failed');

    const result = await createDelegationRelayConnectionPromise(async () => {
      events.push('connect');
      throw failure;
    }, {
      onError: (error) => events.push(`error:${error.message}`),
      onFinally: () => events.push('finally'),
    });

    assert.equal(result, undefined);
    assert.deepEqual(events, ['connect', 'error:relay subscribe failed', 'finally']);
  });

  it('rejects invalid connection callbacks early', async () => {
    assert.throws(
      () => createDelegationRelayConnectionPromise(null),
      /connect must be a function/,
    );
  });
});