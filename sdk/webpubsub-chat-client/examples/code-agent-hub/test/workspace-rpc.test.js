import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceRpc } from '../workspace-rpc.js';

describe('workspace-rpc', () => {
  let rpc;
  let sentMessages;
  let responseCallback;

  beforeEach(() => {
    sentMessages = [];
    rpc = createWorkspaceRpc(
      async (roomId, jsonString) => {
        sentMessages.push({ roomId, data: JSON.parse(jsonString) });
      },
      (callback) => {
        responseCallback = callback;
      },
    );
  });

  it('should send a workspace.request and resolve on response', async () => {
    const callPromise = rpc.call('room-1', 'readTextFile', { path: '/test.js' });

    // Wait a tick for the async sendToRoom to complete
    await new Promise(r => setTimeout(r, 10));

    // Verify request was sent
    assert.equal(sentMessages.length, 1);
    const req = sentMessages[0].data;
    assert.equal(req.type, 'workspace.request');
    assert.equal(req.method, 'readTextFile');
    assert.deepEqual(req.params, { path: '/test.js' });
    assert.ok(req.requestId);

    // Simulate response
    responseCallback('room-1', {
      type: 'workspace.response',
      requestId: req.requestId,
      result: { content: 'hello world' },
    });

    const result = await callPromise;
    assert.deepEqual(result, { content: 'hello world' });
  });

  it('should reject on error response', async () => {
    const callPromise = rpc.call('room-1', 'readTextFile', { path: '/missing.js' });
    await new Promise(r => setTimeout(r, 10));
    const req = sentMessages[0].data;

    responseCallback('room-1', {
      type: 'workspace.response',
      requestId: req.requestId,
      error: { message: 'ENOENT: no such file' },
    });

    await assert.rejects(callPromise, { message: 'ENOENT: no such file' });
  });

  it('should reject on timeout', async () => {
    const callPromise = rpc.call('room-1', 'readTextFile', { path: '/slow.js' }, undefined, 100);
    await assert.rejects(callPromise, { message: /timeout/i });
  });

  it('should handle multiple concurrent RPCs with different requestIds', async () => {
    const p1 = rpc.call('room-1', 'readTextFile', { path: '/a.js' });
    const p2 = rpc.call('room-1', 'readTextFile', { path: '/b.js' });

    await new Promise(r => setTimeout(r, 10));
    assert.equal(sentMessages.length, 2);
    const req1 = sentMessages[0].data;
    const req2 = sentMessages[1].data;
    assert.notEqual(req1.requestId, req2.requestId);

    // Respond to second first
    responseCallback('room-1', { type: 'workspace.response', requestId: req2.requestId, result: { content: 'b' } });
    responseCallback('room-1', { type: 'workspace.response', requestId: req1.requestId, result: { content: 'a' } });

    assert.deepEqual(await p1, { content: 'a' });
    assert.deepEqual(await p2, { content: 'b' });
  });

  it('should ignore duplicate responses', async () => {
    const callPromise = rpc.call('room-1', 'readTextFile', { path: '/test.js' });
    await new Promise(r => setTimeout(r, 10));
    const req = sentMessages[0].data;

    responseCallback('room-1', { type: 'workspace.response', requestId: req.requestId, result: { content: 'first' } });
    // Second response should be silently ignored (no crash)
    responseCallback('room-1', { type: 'workspace.response', requestId: req.requestId, result: { content: 'second' } });

    const result = await callPromise;
    assert.deepEqual(result, { content: 'first' });
  });

  it('should ignore responses from a different room', async () => {
    const callPromise = rpc.call('room-1', 'readTextFile', { path: '/test.js' }, undefined, 100);
    await new Promise(r => setTimeout(r, 10));
    const req = sentMessages[0].data;

    responseCallback('room-2', { type: 'workspace.response', requestId: req.requestId, result: { content: 'wrong-room' } });

    await assert.rejects(callPromise, { message: /timeout/i });
  });

  it('should pass terminal exit timeout as the fifth argument', async () => {
    const remote = rpc.createRemoteAcpClient('room-1', async () => {}, async () => true);
    const callPromise = remote.waitForTerminalExit({ terminalId: 'term-1' });

    await new Promise(r => setTimeout(r, 10));

    assert.equal(sentMessages.length, 1);
    const message = sentMessages[0].data;
    assert.equal(message.type, 'workspace.request');
    assert.equal(message.method, 'waitForTerminalExit');
    assert.equal(message.targetClientId, undefined);

    responseCallback('room-1', { type: 'workspace.response', requestId: message.requestId, result: { exitCode: 0 } });

    assert.deepEqual(await callPromise, { exitCode: 0 });
  });

  it('should ignore non-workspace.response messages', () => {
    // Should not throw
    responseCallback('room-1', { type: 'user.prompt', content: 'hello' });
    responseCallback('room-1', { type: 'workspace.response', requestId: 'nonexistent', result: {} });
  });
});
