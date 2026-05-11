function normalizeRoomId(roomLike) {
  return String(roomLike?.roomId ?? roomLike?.sessionId ?? '').trim();
}

function listSupplementalRoomInfos(supplementalRoomInfos) {
  return supplementalRoomInfos instanceof Map
    ? [...supplementalRoomInfos.values()]
    : [];
}

function isAlreadyMemberError(error) {
  return /already|exists|member/i.test(String(error?.message || ''));
}

export function rememberKnownRoomInfo(supplementalRoomInfos, roomInfo) {
  if (!(supplementalRoomInfos instanceof Map)) {
    return null;
  }

  const roomId = normalizeRoomId(roomInfo);
  if (!roomId) {
    return null;
  }

  supplementalRoomInfos.set(roomId, roomInfo);
  return roomInfo;
}

export function collectKnownRoomInfos({ chatRooms = [], supplementalRoomInfos = new Map(), currentSession = null } = {}) {
  const roomInfosById = new Map();

  for (const roomInfo of [...(Array.isArray(chatRooms) ? chatRooms : []), ...listSupplementalRoomInfos(supplementalRoomInfos)]) {
    const roomId = normalizeRoomId(roomInfo);
    if (roomId) {
      roomInfosById.set(roomId, roomInfo);
    }
  }

  const currentSessionRoomId = normalizeRoomId(currentSession);
  if (currentSessionRoomId) {
    roomInfosById.set(currentSessionRoomId, currentSession);
  }

  return [...roomInfosById.values()];
}

export async function ensureLocalRoomInfo(roomId, {
  chatRooms = [],
  supplementalRoomInfos = new Map(),
  hasJoinedRoom = () => false,
  getRoomInfo,
  addSelfToRoom,
  currentUserId = '',
  shouldIgnoreAddSelfError = () => false,
} = {}) {
  const targetRoomId = String(roomId || '').trim();
  if (!targetRoomId || typeof getRoomInfo !== 'function') {
    return null;
  }

  const hasLocalRoom = (Array.isArray(chatRooms) ? chatRooms : [])
    .some((roomInfo) => normalizeRoomId(roomInfo) === targetRoomId);
  const joined = typeof hasJoinedRoom === 'function' ? hasJoinedRoom(targetRoomId) : false;

  try {
    const roomInfo = await getRoomInfo(targetRoomId);
    if (roomInfo) {
      return rememberKnownRoomInfo(supplementalRoomInfos, roomInfo);
    }
  } catch (error) {
    if ((hasLocalRoom || joined) || typeof addSelfToRoom !== 'function' || !currentUserId) {
      throw error;
    }
  }

  if ((!hasLocalRoom || !joined) && typeof addSelfToRoom === 'function' && currentUserId) {
    try {
      await addSelfToRoom(targetRoomId, currentUserId);
    } catch (error) {
      if (!isAlreadyMemberError(error)) {
        if (typeof shouldIgnoreAddSelfError === 'function' && shouldIgnoreAddSelfError(error, {
          roomId: targetRoomId,
          currentUserId,
          hasLocalRoom,
          joined,
        })) {
          return null;
        }
        throw error;
      }
    }
  }

  const roomInfo = await getRoomInfo(targetRoomId);
  return rememberKnownRoomInfo(supplementalRoomInfos, roomInfo);
}