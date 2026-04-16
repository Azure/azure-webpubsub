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

export function isDaemonAccessStateResolved(daemon) {
  if (!daemon || typeof daemon !== 'object') {
    return false;
  }
  const explicitKeys = [
    'canManage',
    'hasMemberAccess',
    'hasAdminAccess',
    'canRead',
    'canWrite',
    'accessRequestStatus',
    'requestedAccess',
  ];
  return explicitKeys.some((key) => Object.prototype.hasOwnProperty.call(daemon, key)) || daemon.accessResolved === true;
}

export function getSessionListAccessPresentation(accessLevel = 'none', { suppressGrantedAccessBadge = false } = {}) {
  const normalizedAccessLevel = String(accessLevel || '').trim().toLowerCase();
  const requestReadLabel = 'Request Read';
  const requestWriteLabel = 'Request Write';
  if (normalizedAccessLevel === 'none') {
    return {
      badgeClassName: 'is-no-access',
      badgeLabel: 'No Access',
      isRequestable: true,
      requestReadLabel,
      requestWriteLabel,
    };
  }
  if (suppressGrantedAccessBadge) {
    return {
      badgeClassName: '',
      badgeLabel: '',
      isRequestable: false,
      requestReadLabel,
      requestWriteLabel,
    };
  }
  if (normalizedAccessLevel === 'write') {
    return { badgeClassName: 'is-write', badgeLabel: 'Write Access', isRequestable: false, requestReadLabel, requestWriteLabel };
  }
  if (normalizedAccessLevel === 'read') {
    return { badgeClassName: 'is-read', badgeLabel: 'Read Access', isRequestable: false, requestReadLabel, requestWriteLabel };
  }
  return { badgeClassName: '', badgeLabel: '', isRequestable: false, requestReadLabel, requestWriteLabel };
}

export function isStartupWaitMessage(message = '') {
  return /agent is still starting/i.test(String(message || ''));
}

export function isStartupStatusEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return false;
  }

  const message = String(envelope.message || '').trim();
  if (envelope.type === 'session.state') {
    return envelope.ready === false;
  }
  if (envelope.type === 'system.info') {
    return /^(starting|connected to|resuming|resumed)\b/i.test(message);
  }
  if (envelope.type === 'session.error') {
    return isStartupWaitMessage(message)
      || /^failed to start:/i.test(message)
      || /oauth code flow requires a browser/i.test(message);
  }
  return false;
}

export function createSessionHistorySummary() {
  return {
    envelopeCount: 0,
    hasStartupSignal: false,
    hasConversationContent: false,
    hasSyncEvidence: false,
    readyState: null,
  };
}

export function recordSessionHistoryEnvelope(summary, envelope) {
  const target = summary || createSessionHistorySummary();
  if (!envelope || typeof envelope !== 'object') {
    return target;
  }

  target.envelopeCount += 1;

  if (isStartupStatusEnvelope(envelope)) {
    target.hasStartupSignal = true;
  }

  if (envelope.type === 'session.state' && typeof envelope.ready === 'boolean') {
    target.readyState = envelope.ready;
  }

  if (
    envelope.type === 'session.state'
    || envelope.type === 'session.idle'
    || envelope.type === 'assistant.message'
    || envelope.type === 'assistant.delta'
    || envelope.type === 'assistant.reasoning'
    || envelope.type === 'assistant.reasoning_delta'
    || envelope.type === 'tool.start'
    || envelope.type === 'tool.complete'
    || envelope.type === 'permission.request'
    || envelope.type === 'permission.response'
    || envelope.type === 'session.error'
    || envelope.type === 'system.info'
  ) {
    target.hasSyncEvidence = true;
  }

  if (
    envelope.type === 'assistant.message'
    || envelope.type === 'assistant.delta'
    || envelope.type === 'assistant.reasoning'
    || envelope.type === 'assistant.reasoning_delta'
    || envelope.type === 'tool.start'
    || envelope.type === 'tool.complete'
    || envelope.type === 'permission.request'
    || envelope.type === 'permission.response'
    || envelope.type === 'user.prompt'
    || envelope.type === 'user.command'
    || envelope.type === 'delegation.prompt'
    || envelope.type === 'delegation.dispatched'
    || envelope.type === 'delegation.started'
    || envelope.type === 'delegation.completed'
    || envelope.type === 'delegation.failed'
    || envelope.type === 'delegation.cancelled'
    || envelope.type === 'delegation.expired'
    || (envelope.type === 'system.info' && !isStartupStatusEnvelope(envelope))
    || (envelope.type === 'session.error' && !isStartupStatusEnvelope(envelope))
  ) {
    target.hasConversationContent = true;
  }

  return target;
}

export function shouldSuppressSessionOpenError(error, historySummary = null) {
  const message = String(error?.message || error || '');
  if (!/Timed out waiting for live session sync/i.test(message)) {
    return false;
  }

  const summary = historySummary || createSessionHistorySummary();
  if (!summary.envelopeCount) {
    return true;
  }

  return !!summary.hasStartupSignal && summary.readyState !== true && !summary.hasConversationContent;
}

export function shouldBackgroundRetrySessionOpenError(error, historySummary = null) {
  const message = String(error?.message || error || '');
  if (!/Timed out waiting for live session sync/i.test(message)) {
    return false;
  }

  const summary = historySummary || createSessionHistorySummary();
  return !!summary.envelopeCount;
}

export function getSessionChatPlaceholderState({
  agentLabel = 'Session',
  isStarting = false,
  isSyncing = false,
  isReadOnly = false,
} = {}) {
  const kicker = String(agentLabel || 'Session').trim() || 'Session';

  if (isStarting || isSyncing) {
    return {
      kicker,
      title: isSyncing ? 'Session is syncing' : 'Session is still starting',
      subtitle: isSyncing
        ? 'This shared session has not delivered live state yet. If it was just created, the agent may still be starting.'
        : 'The agent has not finished initializing yet. Keep this room open and it will become ready automatically.',
    };
  }

  if (isReadOnly) {
    return {
      kicker,
      title: 'No conversation yet',
      subtitle: 'This session is empty. Wait for the owner to send the first message or request write access to start it yourself.',
    };
  }

  return {
    kicker,
    title: 'No conversation yet',
    subtitle: 'This session is ready but empty. Send the first message to start the conversation.',
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
    accessResolved: isDaemonAccessStateResolved(daemon),
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