const DEFAULT_DAEMON_ACCESS_CONCURRENCY = 8;

async function mapLimit(items, limit, iteratee) {
  const queue = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Number(limit) || 1);
  let index = 0;

  async function worker() {
    while (index < queue.length) {
      const currentIndex = index;
      index += 1;
      await iteratee(queue[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));
}

export async function loadDaemonAccessMap({
  daemonRegistryRecords = [],
  loadAccessState,
  selectValue = ({ daemon, accessState }) => ({ daemon, accessState }),
  concurrency = DEFAULT_DAEMON_ACCESS_CONCURRENCY,
} = {}) {
  if (typeof loadAccessState !== 'function') {
    throw new TypeError('loadAccessState must be a function');
  }

  const daemonAccessById = new Map();
  await mapLimit(daemonRegistryRecords, concurrency, async (daemon, index) => {
    const daemonId = String(daemon?.daemonId || '').trim();
    if (!daemonId) return;
    const accessState = await loadAccessState(daemon, index);
    daemonAccessById.set(daemonId, selectValue({ daemon, accessState }, index));
  });
  return daemonAccessById;
}

export async function loadDaemonAccessMapForIds({
  daemonIds = [],
  loadDaemonRecord,
  loadAccessState,
  selectValue = ({ daemon, accessState }) => ({ daemon, accessState }),
  concurrency = DEFAULT_DAEMON_ACCESS_CONCURRENCY,
} = {}) {
  if (typeof loadDaemonRecord !== 'function') {
    throw new TypeError('loadDaemonRecord must be a function');
  }
  if (typeof loadAccessState !== 'function') {
    throw new TypeError('loadAccessState must be a function');
  }

  const daemonAccessById = new Map();
  await mapLimit(daemonIds, concurrency, async (daemonId, index) => {
    const normalizedDaemonId = String(daemonId || '').trim();
    if (!normalizedDaemonId) return;
    const daemon = await loadDaemonRecord(normalizedDaemonId, index);
    if (!daemon) return;
    const accessState = await loadAccessState(daemon, index);
    const resolvedDaemonId = String(daemon?.daemonId || normalizedDaemonId).trim();
    if (!resolvedDaemonId) return;
    daemonAccessById.set(resolvedDaemonId, selectValue({ daemon, accessState }, index));
  });
  return daemonAccessById;
}