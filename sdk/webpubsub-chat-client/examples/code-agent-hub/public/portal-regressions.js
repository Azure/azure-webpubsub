export function daemonHasAdminAccess(daemon) {
  return !!(daemon && (daemon.hasAdminAccess || daemon.canWrite));
}

export function daemonHasMemberAccess(daemon) {
  return !!(daemon && (daemon.hasMemberAccess || daemon.canRead || daemonHasAdminAccess(daemon)));
}

export function getCreateSessionAccessState(daemon) {
  const hasMemberAccess = daemonHasMemberAccess(daemon);
  const hasAdminAccess = daemonHasAdminAccess(daemon);
  return {
    blocked: !!daemon && !hasMemberAccess && !hasAdminAccess,
    readOnly: !!daemon && hasMemberAccess && !hasAdminAccess,
  };
}

export function normalizeDaemonRecord(daemon, normalizePlatform = (platform) => platform || '') {
  const hasAdminAccess = daemonHasAdminAccess(daemon);
  const hasMemberAccess = daemonHasMemberAccess(daemon);
  return {
    daemonId: daemon.daemonId,
    hostname: daemon.hostname || daemon.daemonId,
    platform: normalizePlatform(daemon.platform),
    agents: daemon.agents || [],
    workspaces: daemon.workspaces || [],
    updatedAt: daemon.updatedAt || new Date().toISOString(),
    canManage: !!daemon.canManage,
    ownerUserId: daemon.ownerUserId || '',
    hasMemberAccess,
    hasAdminAccess,
    canRead: hasMemberAccess,
    canWrite: hasAdminAccess,
    memberUsers: daemon.memberUsers || daemon.readerUsers || [],
    adminUsers: daemon.adminUsers || daemon.writerUsers || [],
    readerUsers: daemon.memberUsers || daemon.readerUsers || [],
    writerUsers: daemon.adminUsers || daemon.writerUsers || [],
    accessRequestStatus: daemon.accessRequestStatus || '',
    requestedAccess: daemon.requestedAccess || '',
    approverUserIds: daemon.approverUserIds || [],
  };
}

export function isDaemonRecordFresh(daemon, now = Date.now(), staleMs = 90_000) {
  const updatedAt = Date.parse(String(daemon?.updatedAt || ''));
  return !Number.isFinite(updatedAt) || now - updatedAt <= staleMs;
}

export function shouldRetainPreviousDaemons(previousDaemons, nextDaemons, now = Date.now(), staleMs = 90_000) {
  if (Array.isArray(nextDaemons) && nextDaemons.length > 0) {
    return false;
  }
  const previousEntries = previousDaemons instanceof Map
    ? [...previousDaemons.values()]
    : Array.isArray(previousDaemons)
      ? previousDaemons
      : [];
  return previousEntries.some((daemon) => isDaemonRecordFresh(daemon, now, staleMs));
}

function getRoomMessageId(message) {
  return String(message?.messageId ?? message?.id ?? '').trim();
}

export function isLocalEchoMessage(message, currentUserId) {
  return message?.createdBy === currentUserId && message?.localEcho === true;
}

export function rememberRoomMessage(message, seenRoomMessageIds) {
  const messageId = getRoomMessageId(message);
  if (messageId) seenRoomMessageIds.add(messageId);
  return messageId;
}

export function shouldIgnoreRoomMessage(message, seenRoomMessageIds, historyLoadedAt = 0) {
  const messageId = getRoomMessageId(message);
  if (messageId) return seenRoomMessageIds.has(messageId);
  if (!message?.createdAt || !historyLoadedAt) return false;
  return new Date(message.createdAt).getTime() <= historyLoadedAt;
}

export function resetSessionStateToIdle(sessionState) {
  sessionState.processing = false;
  sessionState.pendingCount = 0;
  sessionState.stopping = false;
  return sessionState;
}