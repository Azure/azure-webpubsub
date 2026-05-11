function sessionAccessLevel(session) {
  if (!session) return 'none';
  const level = String(session.accessLevel || '').toLowerCase();
  if (level === 'read' || level === 'write') return level;
  return session.canWrite ? 'write' : session.canRead ? 'read' : 'none';
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function applySessionQueryContext(session, {
  currentDaemonId = '',
  currentAgentName = '',
} = {}) {
  const next = { ...(session || {}) };
  const daemonId = String(next.daemonId || '').trim();
  const agentName = String(next.agentName || next.agent || '').trim();
  if (!daemonId && currentDaemonId) next.daemonId = currentDaemonId;
  if (!agentName && currentAgentName) next.agentName = currentAgentName;
  return next;
}

export function normalizeSessionRecord(session, previous = {}) {
  const accessLevel = sessionAccessLevel(session);
  return {
    ...previous,
    sessionId: session.sessionId || previous.sessionId,
    defaultConversationId: session.defaultConversationId || previous.defaultConversationId || '',
    ownerUserId: session.ownerUserId || previous.ownerUserId || '',
    daemonId: session.daemonId || previous.daemonId || '',
    agent: session.agentName || session.agent || previous.agent || '',
    workingDirectory: session.workingDirectory || previous.workingDirectory || '',
    name: session.name || session.roomName || previous.name || 'Session',
    updatedAt: session.updatedAt || previous.updatedAt || new Date().toISOString(),
    accessLevel,
    canRead: accessLevel !== 'none',
    canWrite: accessLevel === 'write',
    joinStatus: session.joinStatus || previous.joinStatus || '',
    joinRequestId: session.joinRequestId || previous.joinRequestId || '',
    requestedAccess: session.requestedAccess || previous.requestedAccess || '',
    canDelete: session.canDelete ?? previous.canDelete ?? false,
    sessionProcessing: session.sessionProcessing ?? previous.sessionProcessing,
    sessionStopping: session.sessionStopping ?? previous.sessionStopping,
    sessionReady: session.sessionReady ?? previous.sessionReady,
    sessionDelegating: session.sessionDelegating ?? previous.sessionDelegating ?? false,
  };
}

export function getSessionRecordStatusInfo(session) {
  if (!session) return null;
  if (session.sessionProcessing) return { state: 'working', label: 'Working' };
  if (session.sessionStopping) return { state: 'stopping', label: 'Stopping' };
  if (session.sessionDelegating) return { state: 'working', label: 'Working' };
  if (session.sessionReady === false) return { state: 'starting', label: 'Starting' };
  return { state: 'idle', label: 'Idle' };
}

export function buildSessionStatusPatch({
  sessionId = '',
  sessionProcessing,
  sessionStopping,
  sessionReady,
} = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return null;

  const patch = { sessionId: normalizedSessionId };
  if (typeof sessionProcessing === 'boolean') patch.sessionProcessing = sessionProcessing;
  if (typeof sessionStopping === 'boolean') patch.sessionStopping = sessionStopping;
  if (typeof sessionReady === 'boolean') patch.sessionReady = sessionReady;
  return patch;
}

export function sessionNeedsMetadataHydration(session) {
  return !session?.agent || !session?.workingDirectory || !session?.ownerUserId || !session?.daemonId;
}

export function getSessionMetadataHydrationState({
  sessions = [],
  joinedSessionIds,
  inFlightSessionIds,
  lastAttemptBySessionId,
  now = Date.now(),
  cooldownMs = 10000,
} = {}) {
  let actionableCount = 0;
  let inFlightCount = 0;
  const normalizedCooldownMs = Math.max(0, Number(cooldownMs) || 0);

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const sessionId = String(session?.sessionId || '').trim();
    if (!sessionId) continue;
    if (!joinedSessionIds?.has?.(sessionId)) continue;
    if (!sessionNeedsMetadataHydration(session)) continue;

    if (inFlightSessionIds?.has?.(sessionId)) {
      inFlightCount += 1;
      continue;
    }

    const lastAttemptAt = normalizeTimestamp(lastAttemptBySessionId?.get?.(sessionId));
    if (!lastAttemptAt || now - lastAttemptAt >= normalizedCooldownMs) {
      actionableCount += 1;
    }
  }

  return {
    actionableCount,
    inFlightCount,
    pendingCount: actionableCount + inFlightCount,
    shouldShowLoading: actionableCount > 0 || inFlightCount > 0,
  };
}

function normalizeDeletedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function shouldSkipDeletedSession(sessionId, deletedSessions, now = Date.now(), cooldownMs = 5000) {
  const deletedAt = normalizeDeletedAt(deletedSessions?.get?.(sessionId));
  if (!deletedAt) return false;
  return now - deletedAt < Math.max(0, Number(cooldownMs) || 0);
}

export function shouldShowPortalSessionLoading({ queryLoaded, localSessionCount = 0 }) {
  return !queryLoaded && Number(localSessionCount || 0) <= 0;
}

function parseManagedSessionRoomTitle(title) {
  const rawTitle = String(title || '').trim();
  if (!rawTitle) return null;
  try {
    const parsed = JSON.parse(rawTitle);
    const recordType = String(parsed?.t || parsed?.type || '').trim().toLowerCase();
    if (recordType !== 'ms' && recordType !== 'managed-session') {
      return null;
    }
    const roomName = String(parsed?.r || parsed?.roomName || '').trim();
    const daemonId = String(parsed?.d || parsed?.daemonId || '').trim();
    const agentName = String(parsed?.a || parsed?.agentName || '').trim();
    const workingDirectory = String(parsed?.w || parsed?.workingDirectory || '').trim();
    const ownerUserId = String(parsed?.o || parsed?.ownerUserId || '').trim();
    const createdAt = String(parsed?.c || parsed?.createdAt || '').trim();
    const updatedAt = String(parsed?.u || parsed?.updatedAt || '').trim();
    if (!roomName && !daemonId && !agentName && !workingDirectory && !ownerUserId && !createdAt && !updatedAt) {
      return null;
    }
    return {
      roomName: roomName || 'Session',
      daemonId,
      agentName,
      workingDirectory,
      ownerUserId,
      createdAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function resolveRoomDisplayName(roomLike, fallback = 'Session') {
  const parsedRoomTitle = parseManagedSessionRoomTitle(
    roomLike?.title || roomLike?.name || roomLike?.roomName || roomLike?.displayName || '',
  );
  if (parsedRoomTitle?.roomName) return parsedRoomTitle.roomName;
  const directName = String(
    roomLike?.name || roomLike?.roomName || roomLike?.displayName || roomLike?.title || fallback || '',
  ).trim();
  return directName || String(fallback || '').trim() || 'Session';
}

function createJoinedRoomCandidate(room, previous = {}) {
  const parsedRoomTitle = parseManagedSessionRoomTitle(room.title || room.name || room.roomName || room.displayName || '');
  const accessLevel = sessionAccessLevel(previous);
  const resolvedAccessLevel = accessLevel === 'none' ? 'read' : accessLevel;
  return {
    ...previous,
    sessionId: room.roomId,
    defaultConversationId: room.defaultConversationId || previous.defaultConversationId || '',
    ownerUserId: previous.ownerUserId || parsedRoomTitle?.ownerUserId || '',
    daemonId: previous.daemonId || parsedRoomTitle?.daemonId || '',
    agent: previous.agent || parsedRoomTitle?.agentName || '',
    workingDirectory: previous.workingDirectory || parsedRoomTitle?.workingDirectory || '',
    name: previous.name || parsedRoomTitle?.roomName || room.title || room.name || room.roomName || room.displayName || 'Session',
    updatedAt: previous.updatedAt || parsedRoomTitle?.updatedAt || room.updatedAt || parsedRoomTitle?.createdAt || room.createdAt || null,
    accessLevel: resolvedAccessLevel,
    canRead: true,
    canWrite: resolvedAccessLevel === 'write',
    localJoined: true,
  };
}

const DEFAULT_EXCLUDED_ROOM_PREFIXES = ['daemon-acl-'];

export function collectVisibleSessions({
  discoveredSessions,
  chatRooms,
  deletedSessions,
  currentDaemonId = '',
  currentAgentName = '',
  lobbyRoomId = 'lobby',
  excludedRoomPrefixes = DEFAULT_EXCLUDED_ROOM_PREFIXES,
  now = Date.now(),
  deletedCooldownMs = 5000,
}) {
  const sessionMap = new Map();

  for (const [sessionId, session] of discoveredSessions instanceof Map ? discoveredSessions.entries() : []) {
    if (shouldSkipDeletedSession(sessionId, deletedSessions, now, deletedCooldownMs)) continue;
    sessionMap.set(sessionId, normalizeSessionRecord(session, sessionMap.get(sessionId) || {}));
  }

  for (const room of Array.isArray(chatRooms) ? chatRooms : []) {
    if (!room?.roomId || room.roomId === lobbyRoomId) continue;
    if ((excludedRoomPrefixes || []).some((prefix) => prefix && room.roomId.startsWith(prefix))) continue;
    if (shouldSkipDeletedSession(room.roomId, deletedSessions, now, deletedCooldownMs)) continue;
    const previous = sessionMap.get(room.roomId) || {};
    sessionMap.set(room.roomId, createJoinedRoomCandidate(room, previous));
  }

  return [...sessionMap.values()]
    .filter((session) => {
      const isJoined = !!session.localJoined;
      if (currentDaemonId && session.daemonId && session.daemonId !== currentDaemonId) return false;
      if (currentDaemonId && !session.daemonId && !isJoined) return false;
      if (currentAgentName && session.agent && session.agent !== currentAgentName) return false;
      if (currentAgentName && !session.agent && !isJoined) return false;
      return true;
    })
    .sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });
}