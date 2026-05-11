import { randomUUID } from 'crypto';

/**
 * Creates a workspace RPC client that sends requests via Chat Room
 * and waits for responses from a Workspace Agent.
 *
 * @param {Function} sendToRoom - async (roomId, jsonString) => void
 * @param {Function} onResponse - (callback) => void — register listener for workspace.response messages
 */
export function createWorkspaceRpc(sendToRoom, onResponse) {
  const pending = new Map(); // requestId → { resolve, reject, timer }

  // Register response handler
  onResponse((roomId, envelope) => {
    if (envelope.type !== 'workspace.response') return;
    const p = pending.get(envelope.requestId);
    if (!p) return;
    if (p.roomId !== roomId) return;
    pending.delete(envelope.requestId);
    clearTimeout(p.timer);
    if (envelope.error) {
      p.reject(new Error(envelope.error.message || 'Workspace error'));
    } else {
      p.resolve(envelope.result);
    }
  });

  async function call(roomId, method, params, targetClientId, timeoutMs = 60000) {
    const requestId = randomUUID();

    // Set up pending BEFORE sending, so response can be matched even if it arrives synchronously
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Workspace RPC timeout: ${method}`));
      }, timeoutMs);
      pending.set(requestId, { roomId, resolve, reject, timer });
    });

    await sendToRoom(roomId, JSON.stringify({
      type: 'workspace.request',
      requestId,
      method,
      params,
      targetClientId,
    }));

    return promise;
  }

  /**
   * Build an ACP client implementation that routes fs/terminal calls through Chat RPC.
   * sessionUpdate and requestPermission are handled locally (not workspace operations).
   */
  function createRemoteAcpClient(sessionId, sessionUpdateHandler, permissionHandler) {
    return {
      _agent: null,
      _currentMessageText: '',
      _currentThoughtText: '',
      _msgCounter: 0,
      _reasonCounter: 0,

      async requestPermission(params) {
        return permissionHandler(params);
      },

      async sessionUpdate(params) {
        return sessionUpdateHandler(params);
      },

      // ── File system — remote via Chat ──
      async readTextFile(params) {
        return call(sessionId, 'readTextFile', params);
      },

      async writeTextFile(params) {
        return call(sessionId, 'writeTextFile', params);
      },

      // ── Terminal — remote via Chat ──
      async createTerminal(params) {
        return call(sessionId, 'createTerminal', params);
      },

      async terminalOutput(params) {
        return call(sessionId, 'terminalOutput', params);
      },

      async waitForTerminalExit(params) {
        return call(sessionId, 'waitForTerminalExit', params, undefined, 5 * 60 * 1000); // 5 min timeout for long commands
      },

      async killTerminal(params) {
        return call(sessionId, 'killTerminal', params);
      },

      async releaseTerminal(params) {
        return call(sessionId, 'releaseTerminal', params);
      },
    };
  }

  return { call, createRemoteAcpClient };
}
