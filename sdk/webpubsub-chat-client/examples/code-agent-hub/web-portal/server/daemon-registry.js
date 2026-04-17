export function collectDaemonIdsFromRoomInfos(roomInfos = [], knownDaemonIds = [], rememberDaemonRoomInfo = () => '') {
  const daemonIds = new Set();
  for (const roomInfo of roomInfos || []) {
    const daemonId = rememberDaemonRoomInfo(roomInfo);
    if (daemonId) daemonIds.add(daemonId);
  }
  for (const daemonId of knownDaemonIds || []) {
    const normalizedDaemonId = String(daemonId || '').trim();
    if (normalizedDaemonId) daemonIds.add(normalizedDaemonId);
  }
  return daemonIds;
}

async function resolveDaemonRegistryRecords(daemonIds, getDaemonRegistryRecord, warn = () => {}) {
  const records = await Promise.all([...daemonIds].map(async (daemonId) => {
    try {
      return await getDaemonRegistryRecord(daemonId);
    } catch (error) {
      warn(daemonId, error);
      return null;
    }
  }));
  return records.filter(Boolean);
}

export async function listDaemonRegistryRecordsWithFallback({
  listManagedRoomInfos,
  listFreshManagedRoomInfos,
  knownDaemonIds = [],
  rememberDaemonRoomInfo,
  getDaemonRegistryRecord,
  warn = () => {},
}) {
  const loadRecords = async (roomInfos) => await resolveDaemonRegistryRecords(
    collectDaemonIdsFromRoomInfos(roomInfos, knownDaemonIds, rememberDaemonRoomInfo),
    getDaemonRegistryRecord,
    warn,
  );

  const records = await loadRecords(await listManagedRoomInfos());
  if (records.length || !listFreshManagedRoomInfos) {
    return records;
  }

  return await loadRecords(await listFreshManagedRoomInfos());
}