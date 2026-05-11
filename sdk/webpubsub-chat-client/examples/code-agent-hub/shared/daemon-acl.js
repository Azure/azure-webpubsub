const VALID_USER_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export const DAEMON_ACL_ROOM_PREFIX = 'daemon-acl-';
export const DAEMON_ACL_OPERATOR_ROLE = 'room.operator';
export const DAEMON_ACL_MEMBER_ROLE = 'room.member';

function normalizeList(values) {
  const normalizedInput = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/[\s,;]+/)
      : [];
  return [...new Set(normalizedInput
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeAclUsers(values, { adminUserId = '', ownerUserId = '' } = {}) {
  return normalizeList(values)
    .filter((value) => VALID_USER_ID.test(value))
    .filter((value) => value !== adminUserId)
    .filter((value) => value !== ownerUserId);
}

export function daemonAclRoomId(daemonId) {
  return `${DAEMON_ACL_ROOM_PREFIX}${String(daemonId || '').trim()}`;
}

export function buildDaemonAclRoomTitle({ daemonId, ownerUserId, hostname = '', platform = '', agents = [], workspaces = [], online, updatedAt = '', lastSeenAt = '' }) {
  return JSON.stringify({
    type: 'daemon-acl',
    daemonId: String(daemonId || '').trim(),
    ownerUserId: String(ownerUserId || '').trim(),
    hostname: String(hostname || '').trim(),
    platform: String(platform || '').trim(),
    agents: normalizeList(agents || []),
    workspaces: normalizeList(workspaces || []),
    online: online === undefined ? undefined : !!online,
    updatedAt: String(updatedAt || '').trim(),
    lastSeenAt: String(lastSeenAt || '').trim(),
  });
}

export function parseDaemonAclRoomTitle(title) {
  try {
    const parsed = JSON.parse(String(title || ''));
    if (parsed?.type !== 'daemon-acl') return null;
    const daemonId = String(parsed.daemonId || '').trim();
    const ownerUserId = String(parsed.ownerUserId || '').trim();
    if (!daemonId || !ownerUserId) return null;
    return {
      daemonId,
      ownerUserId,
      hostname: String(parsed.hostname || '').trim(),
      platform: String(parsed.platform || '').trim(),
      agents: normalizeList(parsed.agents || []),
      workspaces: normalizeList(parsed.workspaces || []),
      online: parsed.online === undefined ? undefined : !!parsed.online,
      updatedAt: String(parsed.updatedAt || '').trim(),
      lastSeenAt: String(parsed.lastSeenAt || '').trim(),
    };
  } catch {
    return null;
  }
}

export function normalizeDaemonAclMembers(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => ({
      userId: String(value?.userId || value?.id || '').trim(),
      role: String(value?.role || DAEMON_ACL_MEMBER_ROLE).trim() || DAEMON_ACL_MEMBER_ROLE,
    }))
    .filter((value) => VALID_USER_ID.test(value.userId));
}

export function buildDesiredDaemonAclMembers({ ownerUserId, memberUsers, adminUsers, adminUserId = '' }) {
  const normalizedOwnerUserId = String(ownerUserId || '').trim();
  const desiredMembers = new Map();

  if (normalizedOwnerUserId && VALID_USER_ID.test(normalizedOwnerUserId) && normalizedOwnerUserId !== adminUserId) {
    desiredMembers.set(normalizedOwnerUserId, DAEMON_ACL_OPERATOR_ROLE);
  }

  for (const userId of normalizeAclUsers(adminUsers, { adminUserId, ownerUserId: normalizedOwnerUserId })) {
    desiredMembers.set(userId, DAEMON_ACL_OPERATOR_ROLE);
  }

  for (const userId of normalizeAclUsers(memberUsers, { adminUserId, ownerUserId: normalizedOwnerUserId })) {
    if (!desiredMembers.has(userId)) {
      desiredMembers.set(userId, DAEMON_ACL_MEMBER_ROLE);
    }
  }

  return [...desiredMembers.entries()].map(([userId, role]) => ({ userId, role }));
}

export function deriveDaemonAclState({ daemonId, roomTitle, members, adminUserId = '', fallbackOwnerUserId = '' }) {
  const parsedTitle = parseDaemonAclRoomTitle(roomTitle);
  const normalizedMembers = normalizeDaemonAclMembers(members);
  const normalizedDaemonId = String(daemonId || '').trim();
  const effectiveMembers = normalizedMembers.filter((member) => member.userId !== normalizedDaemonId);
  const operatorUsers = effectiveMembers
    .filter((member) => member.role === DAEMON_ACL_OPERATOR_ROLE)
    .map((member) => member.userId);

  const ownerUserId = String(
    parsedTitle?.ownerUserId
    || fallbackOwnerUserId
    || operatorUsers.find((userId) => userId !== adminUserId)
    || effectiveMembers.find((member) => member.userId !== adminUserId)?.userId
    || ''
  ).trim();

  const adminSet = new Set(operatorUsers.filter((userId) => userId !== adminUserId && userId !== ownerUserId));
  const memberUsers = [];

  for (const member of effectiveMembers) {
    if (member.userId === adminUserId || member.userId === ownerUserId || adminSet.has(member.userId)) continue;
    if (!memberUsers.includes(member.userId)) {
      memberUsers.push(member.userId);
    }
  }

  return {
    daemonId: String(daemonId || '').trim(),
    roomId: daemonAclRoomId(daemonId),
    ownerUserId,
    memberUsers,
    adminUsers: [...adminSet],
    members: effectiveMembers,
  };
}

export function canManageDaemonAccess(accessState, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!accessState || !normalizedUserId) return false;
  return accessState.ownerUserId === normalizedUserId || (accessState.adminUsers || []).includes(normalizedUserId);
}

export function canAdminDaemonAccess(accessState, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!accessState || !normalizedUserId) return false;
  return canManageDaemonAccess(accessState, normalizedUserId);
}

export function canMemberDaemonAccess(accessState, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!accessState || !normalizedUserId) return false;
  return canAdminDaemonAccess(accessState, normalizedUserId) || (accessState.memberUsers || []).includes(normalizedUserId);
}

export function canWriteDaemonAccess(accessState, userId) {
  return canAdminDaemonAccess(accessState, userId);
}

export function canReadDaemonAccess(accessState, userId) {
  return canMemberDaemonAccess(accessState, userId);
}