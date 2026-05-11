import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDaemonAccessMap, loadDaemonAccessMapForIds } from '../web-portal/server/daemon-access.js';

describe('daemon access helpers', () => {
  it('loads daemon access states concurrently up to the configured limit', async () => {
    let activeLoads = 0;
    let maxActiveLoads = 0;
    const startedDaemons = [];
    let releaseGate;
    const gate = new Promise((resolve) => {
      releaseGate = resolve;
    });

    const loadPromise = loadDaemonAccessMap({
      daemonRegistryRecords: [
        { daemonId: 'daemon-alpha' },
        { daemonId: 'daemon-beta' },
        { daemonId: 'daemon-gamma' },
      ],
      concurrency: 2,
      loadAccessState: async (daemon) => {
        startedDaemons.push(daemon.daemonId);
        activeLoads += 1;
        maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
        if (startedDaemons.length <= 2) {
          await gate;
        }
        activeLoads -= 1;
        return { daemonId: daemon.daemonId };
      },
      selectValue: ({ accessState }) => accessState,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(maxActiveLoads, 2);
    assert.deepEqual(startedDaemons.sort(), ['daemon-alpha', 'daemon-beta']);

    releaseGate();

    const daemonAccessById = await loadPromise;
    assert.equal(maxActiveLoads, 2);
    assert.equal(daemonAccessById.size, 3);
    assert.deepEqual(
      [...daemonAccessById.values()].map((accessState) => accessState.daemonId).sort(),
      ['daemon-alpha', 'daemon-beta', 'daemon-gamma'],
    );
  });

  it('defaults to storing daemon and access state entries keyed by daemon id', async () => {
    const daemonAccessById = await loadDaemonAccessMap({
      daemonRegistryRecords: [
        null,
        { daemonId: '' },
        { daemonId: 'daemon-alpha', hostname: 'alpha-host' },
      ],
      loadAccessState: async (daemon) => ({ ownerUserId: `${daemon.daemonId}-owner` }),
    });

    assert.equal(daemonAccessById.size, 1);
    assert.deepEqual(daemonAccessById.get('daemon-alpha'), {
      daemon: { daemonId: 'daemon-alpha', hostname: 'alpha-host' },
      accessState: { ownerUserId: 'daemon-alpha-owner' },
    });
  });

  it('loads daemon access entries directly from daemon ids', async () => {
    const daemonAccessById = await loadDaemonAccessMapForIds({
      daemonIds: ['daemon-alpha', '', 'daemon-missing', 'daemon-beta'],
      loadDaemonRecord: async (daemonId) => {
        if (daemonId === 'daemon-missing') return null;
        return { daemonId, hostname: `${daemonId}-host` };
      },
      loadAccessState: async (daemon) => ({ ownerUserId: `${daemon.daemonId}-owner` }),
      selectValue: ({ daemon, accessState }) => ({
        daemonId: daemon.daemonId,
        hostname: daemon.hostname,
        ownerUserId: accessState.ownerUserId,
      }),
    });

    assert.deepEqual([...daemonAccessById.keys()].sort(), ['daemon-alpha', 'daemon-beta']);
    assert.deepEqual(daemonAccessById.get('daemon-alpha'), {
      daemonId: 'daemon-alpha',
      hostname: 'daemon-alpha-host',
      ownerUserId: 'daemon-alpha-owner',
    });
    assert.deepEqual(daemonAccessById.get('daemon-beta'), {
      daemonId: 'daemon-beta',
      hostname: 'daemon-beta-host',
      ownerUserId: 'daemon-beta-owner',
    });
  });
});