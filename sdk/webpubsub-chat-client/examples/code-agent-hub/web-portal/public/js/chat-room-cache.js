export function evictRoomFromClientCache(chatClient, roomId) {
  const targetRoomId = String(roomId || '').trim();
  if (!chatClient || !targetRoomId) return false;

  let removed = false;

  const roomsMap = chatClient._rooms;
  if (roomsMap instanceof Map) {
    removed = roomsMap.delete(targetRoomId) || removed;
  }

  const joinedRoomIds = chatClient._joinedRoomIds;
  if (joinedRoomIds instanceof Set) {
    removed = joinedRoomIds.delete(targetRoomId) || removed;
  }

  if (!removed && Array.isArray(chatClient.rooms)) {
    const roomIndex = chatClient.rooms.findIndex((room) => room?.roomId === targetRoomId);
    if (roomIndex >= 0) {
      chatClient.rooms.splice(roomIndex, 1);
      removed = true;
    }
  }

  return removed;
}