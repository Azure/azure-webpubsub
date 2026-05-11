import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listDaemonRegistryRecordsWithFallback } from '../web-portal/server/daemon-registry.js';

describe('daemon registry helpers', () => {
  it('falls back to a fresh admin snapshot when the current instance snapshot is empty', async () => {
    const steps = [];
    const records = await listDaemonRegistryRecordsWithFallback({
      listManagedRoomInfos: async () => {
        steps.push('stale');
        return [];
      },
      listFreshManagedRoomInfos: async () => {
        steps.push('fresh');
        return [{ roomId: 'daemon-acl-daemon-alpha' }];
      },
      knownDaemonIds: new Set(),
      rememberDaemonRoomInfo: (roomInfo) => String(roomInfo.roomId || '').replace(/^daemon-acl-/, ''),
      getDaemonRegistryRecord: async (daemonId) => {
        steps.push(`load:${daemonId}`);
        return { daemonId, online: true };
      },
    });

    assert.deepEqual(records, [{ daemonId: 'daemon-alpha', online: true }]);
    assert.deepEqual(steps, ['stale', 'fresh', 'load:daemon-alpha']);
  });

  it('uses the current snapshot directly when daemon records are already resolvable', async () => {
    let freshCalls = 0;
    const records = await listDaemonRegistryRecordsWithFallback({
      listManagedRoomInfos: async () => [{ roomId: 'daemon-acl-daemon-beta' }],
      listFreshManagedRoomInfos: async () => {
        freshCalls += 1;
        return [{ roomId: 'daemon-acl-daemon-beta' }];
      },
      knownDaemonIds: new Set(),
      rememberDaemonRoomInfo: (roomInfo) => String(roomInfo.roomId || '').replace(/^daemon-acl-/, ''),
      getDaemonRegistryRecord: async (daemonId) => ({ daemonId, online: true }),
    });

    assert.deepEqual(records, [{ daemonId: 'daemon-beta', online: true }]);
    assert.equal(freshCalls, 0);
  });
});