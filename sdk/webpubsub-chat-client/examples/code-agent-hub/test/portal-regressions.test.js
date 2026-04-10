import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  daemonHasAdminAccess,
  daemonHasMemberAccess,
  getCreateSessionAccessState,
  isLocalEchoMessage,
  isDaemonRecordFresh,
  normalizeDaemonRecord,
  rememberRoomMessage,
  resetSessionStateToIdle,
  shouldIgnoreRoomMessage,
  shouldRetainPreviousDaemons,
} from '../public/portal-regressions.js';

describe('portal regression helpers', () => {
  it('treats daemon admin as member access for session creation', () => {
    const daemon = { daemonId: 'daemon-alpha', canWrite: true };

    assert.equal(daemonHasAdminAccess(daemon), true);
    assert.equal(daemonHasMemberAccess(daemon), true);
    assert.deepEqual(getCreateSessionAccessState(daemon), { blocked: false, readOnly: false });

    const normalized = normalizeDaemonRecord(daemon);
    assert.equal(normalized.hasAdminAccess, true);
    assert.equal(normalized.hasMemberAccess, true);
    assert.equal(normalized.canRead, true);
    assert.equal(normalized.canWrite, true);
  });

  it('dedupes live room updates by message id before timestamps', () => {
    const seenRoomMessageIds = new Set();
    rememberRoomMessage({ messageId: 'history-1', createdAt: '2026-04-10T00:00:00.000Z' }, seenRoomMessageIds);

    assert.equal(
      shouldIgnoreRoomMessage(
        { messageId: 'history-1', createdAt: '2026-04-10T00:10:00.000Z' },
        seenRoomMessageIds,
        Date.now(),
      ),
      true,
    );
    assert.equal(
      shouldIgnoreRoomMessage(
        { messageId: 'live-1', createdAt: '2026-04-10T00:00:01.000Z' },
        seenRoomMessageIds,
        Date.now(),
      ),
      false,
    );
  });

  it('distinguishes local echoes from same-user messages on another device', () => {
    assert.equal(isLocalEchoMessage({ createdBy: 'shared-user', localEcho: true }, 'shared-user'), true);
    assert.equal(isLocalEchoMessage({ createdBy: 'shared-user' }, 'shared-user'), false);
    assert.equal(isLocalEchoMessage({ createdBy: 'other-user', localEcho: true }, 'shared-user'), false);
  });

  it('falls back to timestamp filtering only for legacy messages without ids', () => {
    const historyLoadedAt = new Date('2026-04-10T00:05:00.000Z').getTime();

    assert.equal(
      shouldIgnoreRoomMessage({ createdAt: '2026-04-10T00:00:00.000Z' }, new Set(), historyLoadedAt),
      true,
    );
    assert.equal(
      shouldIgnoreRoomMessage({ createdAt: '2026-04-10T00:10:00.000Z' }, new Set(), historyLoadedAt),
      false,
    );
  });

  it('clears processing and stopping flags when the session goes idle', () => {
    const sessionState = { processing: true, pendingCount: 2, stopping: true };

    assert.equal(resetSessionStateToIdle(sessionState), sessionState);
    assert.deepEqual(sessionState, { processing: false, pendingCount: 0, stopping: false });
  });

  it('keeps the previous daemon list during a transient empty refresh', () => {
    const previousDaemons = new Map([
      ['daemon-alpha', { daemonId: 'daemon-alpha', updatedAt: '2026-04-10T00:00:00.000Z' }],
    ]);
    const now = new Date('2026-04-10T00:00:30.000Z').getTime();

    assert.equal(isDaemonRecordFresh(previousDaemons.get('daemon-alpha'), now, 90_000), true);
    assert.equal(shouldRetainPreviousDaemons(previousDaemons, [], now, 90_000), true);
    assert.equal(shouldRetainPreviousDaemons(previousDaemons, [{ daemonId: 'daemon-alpha' }], now, 90_000), false);
    assert.equal(shouldRetainPreviousDaemons(previousDaemons, [], now + 120_000, 90_000), false);
  });
});