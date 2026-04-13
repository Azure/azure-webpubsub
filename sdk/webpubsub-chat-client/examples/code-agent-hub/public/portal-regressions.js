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

export function canBrowseDaemonDirectories(daemon) {
  return daemonHasAdminAccess(daemon);
}

export function getRealtimeSessionAccessPatch(session, { currentUserId = '', daemon = null } = {}) {
  const ownerUserId = String(session?.ownerUserId || '').trim();
  const viewerUserId = String(currentUserId || '').trim();
  if (ownerUserId && viewerUserId && ownerUserId === viewerUserId) {
    return { accessLevel: 'write', canRead: true, canWrite: true, canDelete: true };
  }
  if (daemonHasAdminAccess(daemon)) {
    return { accessLevel: 'write', canRead: true, canWrite: true, canDelete: true };
  }
  return {};
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

export function mergeRealtimeDaemonRecord(previousDaemon, nextDaemon, normalizePlatform = (platform) => platform || '') {
  const previous = previousDaemon || {};
  const mergedInput = { ...previous, ...(nextDaemon || {}) };
  const normalized = normalizeDaemonRecord(mergedInput, normalizePlatform);

  normalized.accessRequestStatus = nextDaemon?.accessRequestStatus || previous.accessRequestStatus || '';
  normalized.requestedAccess = nextDaemon?.requestedAccess || previous.requestedAccess || '';

  // Lobby daemon events only carry shared daemon state. Keep locally known access flags.
  if (previous.hasMemberAccess && !normalized.hasMemberAccess) {
    normalized.hasMemberAccess = true;
    normalized.canRead = true;
  }
  if (previous.hasAdminAccess && !normalized.hasAdminAccess) {
    normalized.hasAdminAccess = true;
    normalized.canWrite = true;
  }

  return normalized;
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

function getKnownRoomId(roomInfo) {
  return String(roomInfo?.roomId ?? roomInfo?.sessionId ?? '').trim();
}

function getKnownConversationId(roomInfo) {
  return String(roomInfo?.defaultConversationId ?? '').trim();
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

export function resolveNotificationRoomId(notification, roomInfos = []) {
  const directRoomId = String(notification?.conversation?.roomId ?? '').trim();
  if (directRoomId) {
    return directRoomId;
  }

  const conversationId = String(notification?.conversation?.conversationId ?? '').trim();
  if (!conversationId) {
    return '';
  }

  const knownRooms = roomInfos instanceof Map
    ? [...roomInfos.values()]
    : Array.isArray(roomInfos)
      ? roomInfos
      : [];
  const matchedRoom = knownRooms.find((roomInfo) => getKnownConversationId(roomInfo) === conversationId);
  return getKnownRoomId(matchedRoom);
}

export function notificationTargetsRoom(notification, roomId, roomInfos = []) {
  const targetRoomId = String(roomId ?? '').trim();
  return !!targetRoomId && resolveNotificationRoomId(notification, roomInfos) === targetRoomId;
}

export function classifyIncomingSessionRoomMessage(notification, {
  currentRoomId,
  currentUserId,
  roomInfos = [],
  seenRoomMessageIds,
  historyLoadedAt = 0,
} = {}) {
  const message = notification?.message;
  if (!message?.content?.text) {
    return { action: 'ignore', reason: 'empty', roomId: '' };
  }

  const resolvedRoomId = resolveNotificationRoomId(notification, roomInfos);
  if (!resolvedRoomId || resolvedRoomId !== String(currentRoomId ?? '').trim()) {
    return { action: 'ignore', reason: 'room-mismatch', roomId: resolvedRoomId };
  }

  if (isLocalEchoMessage(message, currentUserId)) {
    rememberRoomMessage(message, seenRoomMessageIds);
    return { action: 'ignore', reason: 'local-echo', roomId: resolvedRoomId };
  }

  if (shouldIgnoreRoomMessage(message, seenRoomMessageIds, historyLoadedAt)) {
    return { action: 'ignore', reason: 'dedupe', roomId: resolvedRoomId };
  }

  rememberRoomMessage(message, seenRoomMessageIds);
  return { action: 'render', reason: 'match', roomId: resolvedRoomId };
}

function normalizeSemanticRenderContent(content) {
  return String(content || '').replace(/\s+/g, ' ').trim();
}

export function shouldIgnoreSemanticDuplicate(previousRender, nextType, nextContent, now = Date.now(), dedupeWindowMs = 8_000) {
  const normalizedContent = normalizeSemanticRenderContent(nextContent);
  if (!previousRender || !nextType || !normalizedContent) {
    return false;
  }

  const previousType = String(previousRender.type || '').trim();
  const previousContent = normalizeSemanticRenderContent(previousRender.content);
  const previousAt = Number(previousRender.at) || 0;

  return previousType === nextType
    && previousContent === normalizedContent
    && previousAt > 0
    && now - previousAt <= dedupeWindowMs;
}

export function resetSessionStateToIdle(sessionState) {
  sessionState.processing = false;
  sessionState.pendingCount = 0;
  sessionState.stopping = false;
  return sessionState;
}