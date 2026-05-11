const TRUSTED_SOURCES = new Set(['portal', 'hydrate']);

function isTrustedSource(source) {
  return TRUSTED_SOURCES.has(String(source || '').trim().toLowerCase());
}

function compareIsoTimestamp(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function normalizeSessionDirectoryRecord(existing, update) {
  const now = new Date().toISOString();
  const createdAt = String(existing?.createdAt || update?.createdAt || '').trim() || now;
  const updatedAt = String(update?.updatedAt || existing?.updatedAt || '').trim() || createdAt;
  const deletedAt = update?.deletedAt ?? existing?.deletedAt ?? null;
  return {
    sessionId: String(update?.sessionId || existing?.sessionId || '').trim(),
    roomName: String(update?.roomName || existing?.roomName || 'Session').trim() || 'Session',
    daemonId: String(update?.daemonId || existing?.daemonId || '').trim(),
    agentName: String(update?.agentName || existing?.agentName || '').trim(),
    workingDirectory: String(update?.workingDirectory || existing?.workingDirectory || '').trim(),
    ownerUserId: String(update?.ownerUserId || existing?.ownerUserId || '').trim(),
    createdAt,
    updatedAt,
    deletedAt: deletedAt ? String(deletedAt).trim() : null,
  };
}

function normalizeMembershipAccess(accessLevel) {
  const normalized = String(accessLevel || '').trim().toLowerCase();
  if (normalized === 'room.operator' || normalized === 'write') return 'write';
  if (normalized === 'room.member' || normalized === 'read') return 'read';
  return '';
}

function normalizeJoinRequestRecord(existing, update) {
  const now = new Date().toISOString();
  const createdAt = String(existing?.createdAt || update?.createdAt || '').trim() || now;
  const updatedAt = String(update?.updatedAt || existing?.updatedAt || '').trim() || createdAt;
  return {
    requestId: String(update?.requestId || existing?.requestId || '').trim(),
    requesterUserId: String(update?.requesterUserId || existing?.requesterUserId || '').trim(),
    ownerUserId: String(update?.ownerUserId || existing?.ownerUserId || '').trim(),
    daemonId: String(update?.daemonId || existing?.daemonId || '').trim(),
    agentName: String(update?.agentName || existing?.agentName || '').trim(),
    workingDirectory: String(update?.workingDirectory || existing?.workingDirectory || '').trim(),
    roomName: String(update?.roomName || existing?.roomName || 'Session').trim() || 'Session',
    requestedAccess: String(update?.requestedAccess || existing?.requestedAccess || '').trim(),
    status: String(update?.status || existing?.status || '').trim(),
    createdAt,
    updatedAt,
  };
}

function getOrCreateSessionMembership(state, sessionId) {
  let members = state.membershipBySessionId.get(sessionId);
  if (!members) {
    members = new Map();
    state.membershipBySessionId.set(sessionId, members);
  }
  return members;
}

function getOrCreateSessionJoinRequests(state, sessionId) {
  let requests = state.joinRequestsBySessionId.get(sessionId);
  if (!requests) {
    requests = new Map();
    state.joinRequestsBySessionId.set(sessionId, requests);
  }
  return requests;
}

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

function buildSessionDirectoryRecordFromRoomInfo(roomInfo, parseSessionRoomTitle) {
  if (!roomInfo?.roomId || typeof parseSessionRoomTitle !== 'function') return null;
  const metadata = parseSessionRoomTitle(roomInfo.title || roomInfo.name || '');
  if (!metadata) return null;
  return normalizeSessionDirectoryRecord(null, {
    sessionId: roomInfo.roomId,
    roomName: metadata.roomName,
    daemonId: metadata.daemonId,
    agentName: metadata.agentName,
    workingDirectory: metadata.workingDirectory,
    ownerUserId: metadata.ownerUserId,
    createdAt: metadata.createdAt || roomInfo.createdAt,
    updatedAt: metadata.updatedAt || roomInfo.updatedAt || roomInfo.createdAt,
  });
}

function mergeCurrentStateIntoHydratedState(hydratedState, currentState) {
  for (const [sessionId, currentRecord] of currentState?.directoryBySessionId?.entries?.() || []) {
    const hydratedRecord = hydratedState.directoryBySessionId.get(sessionId);
    if (!hydratedRecord || currentRecord.deletedAt || compareIsoTimestamp(currentRecord.updatedAt, hydratedRecord.updatedAt) >= 0) {
      hydratedState.directoryBySessionId.set(sessionId, currentRecord);
    }
  }

  for (const [sessionId, currentMembers] of currentState?.membershipBySessionId?.entries?.() || []) {
    const sessionRecord = hydratedState.directoryBySessionId.get(sessionId);
    if (!sessionRecord || sessionRecord.deletedAt) continue;
    const nextMembers = getOrCreateSessionMembership(hydratedState, sessionId);
    for (const [userId, accessLevel] of currentMembers.entries()) {
      nextMembers.set(userId, accessLevel);
    }
  }

  for (const [sessionId, currentRequests] of currentState?.joinRequestsBySessionId?.entries?.() || []) {
    const sessionRecord = hydratedState.directoryBySessionId.get(sessionId);
    if (!sessionRecord || sessionRecord.deletedAt) continue;
    const nextRequests = getOrCreateSessionJoinRequests(hydratedState, sessionId);
    for (const [requestId, currentRequest] of currentRequests.entries()) {
      const hydratedRequest = nextRequests.get(requestId);
      if (!hydratedRequest || compareIsoTimestamp(currentRequest.updatedAt, hydratedRequest.updatedAt) >= 0) {
        nextRequests.set(requestId, currentRequest);
      }
    }
  }

  for (const [sessionId, sessionRecord] of hydratedState.directoryBySessionId.entries()) {
    if (!sessionRecord?.deletedAt) continue;
    hydratedState.membershipBySessionId.delete(sessionId);
    hydratedState.joinRequestsBySessionId.delete(sessionId);
  }
}

export function createSessionIndexState() {
  return {
    directoryBySessionId: new Map(),
    membershipBySessionId: new Map(),
    joinRequestsBySessionId: new Map(),
    hydratedAt: 0,
  };
}

export function upsertTrustedSessionDirectoryRecord(state, update, { source = 'portal' } = {}) {
  if (!state || !isTrustedSource(source)) return null;
  const nextRecord = normalizeSessionDirectoryRecord(state.directoryBySessionId.get(String(update?.sessionId || '').trim()) || null, update);
  if (!nextRecord.sessionId) return null;
  state.directoryBySessionId.set(nextRecord.sessionId, nextRecord);
  return nextRecord;
}

export function markTrustedSessionDeleted(state, sessionId, deletedAt = new Date().toISOString(), { source = 'portal' } = {}) {
  if (!state || !isTrustedSource(source)) return null;
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return null;
  const existing = state.directoryBySessionId.get(normalizedSessionId);
  if (!existing) return null;
  const nextRecord = normalizeSessionDirectoryRecord(existing, {
    sessionId: normalizedSessionId,
    deletedAt,
    updatedAt: deletedAt,
  });
  state.directoryBySessionId.set(normalizedSessionId, nextRecord);
  state.membershipBySessionId.delete(normalizedSessionId);
  state.joinRequestsBySessionId.delete(normalizedSessionId);
  return nextRecord;
}

export function upsertTrustedSessionMembership(state, sessionId, userId, accessLevel, { source = 'portal' } = {}) {
  if (!state || !isTrustedSource(source)) return false;
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  const normalizedAccessLevel = normalizeMembershipAccess(accessLevel);
  if (!normalizedSessionId || !normalizedUserId || !normalizedAccessLevel) return false;
  getOrCreateSessionMembership(state, normalizedSessionId).set(normalizedUserId, normalizedAccessLevel);
  return true;
}

export function removeTrustedSessionMembership(state, sessionId, userId, { source = 'portal' } = {}) {
  if (!state || !isTrustedSource(source)) return false;
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  const members = state.membershipBySessionId.get(normalizedSessionId);
  if (!members || !normalizedUserId) return false;
  const deleted = members.delete(normalizedUserId);
  if (!members.size) {
    state.membershipBySessionId.delete(normalizedSessionId);
  }
  return deleted;
}

export function upsertTrustedJoinRequestState(state, sessionId, update, { source = 'portal' } = {}) {
  if (!state || !isTrustedSource(source)) return null;
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return null;
  const nextRecord = normalizeJoinRequestRecord(null, update);
  if (!nextRecord.requestId || !nextRecord.requesterUserId) return null;
  const requests = getOrCreateSessionJoinRequests(state, normalizedSessionId);
  const current = requests.get(nextRecord.requestId);
  const merged = normalizeJoinRequestRecord(current, update);
  if (current && compareIsoTimestamp(merged.updatedAt, current.updatedAt) < 0) {
    return current;
  }
  requests.set(merged.requestId, merged);
  return merged;
}

export function findJoinRequestById(state, sessionId, requestId) {
  return state?.joinRequestsBySessionId?.get(String(sessionId || '').trim())?.get(String(requestId || '').trim()) || null;
}

export function listJoinRequestsForSession(state, sessionId) {
  return [...(state?.joinRequestsBySessionId?.get(String(sessionId || '').trim())?.values() || [])]
    .sort((left, right) => compareIsoTimestamp(right.updatedAt, left.updatedAt));
}

export function getLatestJoinRequestForUser(state, sessionId, requesterUserId) {
  const normalizedRequesterUserId = String(requesterUserId || '').trim();
  if (!normalizedRequesterUserId) return null;
  return listJoinRequestsForSession(state, sessionId)
    .find((request) => request.requesterUserId === normalizedRequesterUserId) || null;
}

export function getSessionAccessLevelFromIndex({ state, sessionRecord, daemonAccessState, userId, canAdminDaemonAccess, canMemberDaemonAccess }) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedSessionId = String(sessionRecord?.sessionId || '').trim();
  if (!normalizedUserId || !normalizedSessionId || !sessionRecord) return 'none';
  if (sessionRecord.ownerUserId === normalizedUserId) return 'write';
  if (typeof canAdminDaemonAccess === 'function' && canAdminDaemonAccess(daemonAccessState, normalizedUserId)) {
    return 'write';
  }
  // Defense in depth: a per-session membership entry only confers access while the
  // user still has daemon-level access. Without this gate, a user removed from the
  // daemon ACL would retain whatever role was previously written to membershipBySessionId
  // (via accessSelf or join-request approval) until the chat room is also cleaned up.
  if (typeof canMemberDaemonAccess === 'function' && !canMemberDaemonAccess(daemonAccessState, normalizedUserId)) {
    return 'none';
  }
  return state?.membershipBySessionId?.get(normalizedSessionId)?.get(normalizedUserId) || 'none';
}

export function buildSessionListForUser({
  state,
  daemonAccessById,
  userId,
  daemonFilter = '',
  agentFilter = '',
  activeDelegationSourceSessionIds,
  canAdminDaemonAccess,
  canMemberDaemonAccess,
} = {}) {
  const sessions = [];
  const normalizedUserId = String(userId || '').trim();
  const normalizedDaemonFilter = String(daemonFilter || '').trim();
  const normalizedAgentFilter = String(agentFilter || '').trim();

  for (const sessionRecord of state?.directoryBySessionId?.values() || []) {
    if (!sessionRecord?.sessionId || sessionRecord.deletedAt) continue;
    if (normalizedDaemonFilter && sessionRecord.daemonId !== normalizedDaemonFilter) continue;
    if (normalizedAgentFilter && sessionRecord.agentName !== normalizedAgentFilter) continue;
    const daemonEntry = daemonAccessById?.get(sessionRecord.daemonId);
    if (!daemonEntry?.daemon) continue;
    if (daemonEntry.daemon.online === false) continue;
    if (typeof canMemberDaemonAccess === 'function' && !canMemberDaemonAccess(daemonEntry.accessState, normalizedUserId)) {
      continue;
    }
    const accessLevel = getSessionAccessLevelFromIndex({
      state,
      sessionRecord,
      daemonAccessState: daemonEntry.accessState,
      userId: normalizedUserId,
      canAdminDaemonAccess,
      canMemberDaemonAccess,
    });
    const joinRequest = getLatestJoinRequestForUser(state, sessionRecord.sessionId, normalizedUserId);
    const canDelete = sessionRecord.ownerUserId === normalizedUserId
      || (typeof canAdminDaemonAccess === 'function' && canAdminDaemonAccess(daemonEntry.accessState, normalizedUserId));
    sessions.push({
      sessionId: sessionRecord.sessionId,
      roomName: sessionRecord.roomName,
      daemonId: sessionRecord.daemonId,
      agent: sessionRecord.agentName,
      agentName: sessionRecord.agentName,
      workingDirectory: sessionRecord.workingDirectory,
      ownerUserId: sessionRecord.ownerUserId,
      updatedAt: sessionRecord.updatedAt,
      joined: accessLevel !== 'none',
      accessLevel,
      canRead: accessLevel === 'read' || accessLevel === 'write',
      canWrite: accessLevel === 'write',
      joinStatus: joinRequest?.status || '',
      joinRequestId: joinRequest?.requestId || '',
      requestedAccess: joinRequest?.requestedAccess || '',
      sessionDelegating: !!activeDelegationSourceSessionIds?.has?.(sessionRecord.sessionId),
      canDelete,
    });
  }

  sessions.sort((left, right) => compareIsoTimestamp(right.updatedAt, left.updatedAt));
  return sessions;
}

export async function hydrateSessionIndices({
  state,
  roomInfos = [],
  parseSessionRoomTitle,
  loadSessionMembers = async () => [],
  loadJoinRequests = async () => [],
  adminUserId = '',
  roomConcurrency = 8,
} = {}) {
  const nextState = createSessionIndexState();
  const normalizedAdminUserId = String(adminUserId || '').trim();

  await mapLimit(roomInfos || [], roomConcurrency, async (roomInfo) => {
    const sessionRecord = buildSessionDirectoryRecordFromRoomInfo(roomInfo, parseSessionRoomTitle);
    if (!sessionRecord) return;
    upsertTrustedSessionDirectoryRecord(nextState, sessionRecord, { source: 'hydrate' });
    const [members, requests] = await Promise.all([
      loadSessionMembers(sessionRecord.sessionId),
      loadJoinRequests(sessionRecord.sessionId),
    ]);
    for (const member of members || []) {
      const normalizedUserId = String(member?.userId || '').trim();
      if (!normalizedUserId) continue;
      if (normalizedUserId === normalizedAdminUserId) continue;
      if (normalizedUserId === sessionRecord.daemonId) continue;
      if (normalizedUserId === sessionRecord.ownerUserId) continue;
      upsertTrustedSessionMembership(nextState, sessionRecord.sessionId, normalizedUserId, member.role, { source: 'hydrate' });
    }
    for (const request of requests || []) {
      upsertTrustedJoinRequestState(nextState, sessionRecord.sessionId, request, { source: 'hydrate' });
    }
  });

  mergeCurrentStateIntoHydratedState(nextState, state);
  state.directoryBySessionId = nextState.directoryBySessionId;
  state.membershipBySessionId = nextState.membershipBySessionId;
  state.joinRequestsBySessionId = nextState.joinRequestsBySessionId;
  state.hydratedAt = Date.now();
  return state;
}