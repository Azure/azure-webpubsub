function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function waitForJoinedRoom(roomId, {
  hasJoinedRoom,
  getRoomInfo,
  hydrateJoinedRoom,
  timeoutMs = 8000,
  pollIntervalMs = 150,
  sleep = defaultSleep,
}) {
  const targetRoomId = String(roomId || '').trim();
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  let lastError = null;

  while (Date.now() < deadline) {
    if (hasJoinedRoom(targetRoomId)) {
      return true;
    }

    try {
      const roomInfo = await getRoomInfo(targetRoomId);
      if (roomInfo && !hasJoinedRoom(targetRoomId)) {
        try {
          await hydrateJoinedRoom(targetRoomId);
        } catch (error) {
          lastError = error;
        }

        if (hasJoinedRoom(targetRoomId)) {
          return true;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(pollIntervalMs);
  }

  const detail = lastError ? `: ${lastError.message || lastError}` : '';
  throw new Error(`Timed out waiting for room membership${detail}`);
}

export async function waitForRoomLiveSync(roomId, {
  subscribeToMessages,
  sendSyncRequest,
  messageHasSyncEvidence,
  timeoutMs = 4000,
  retryIntervalMs = 500,
  sleep = defaultSleep,
}) {
  const targetRoomId = String(roomId || '').trim();
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  let lastError = null;
  let synced = false;
  let resolveSync;
  const syncPromise = new Promise((resolve) => {
    resolveSync = resolve;
  });

  const unsubscribe = subscribeToMessages((message) => {
    try {
      if (!messageHasSyncEvidence(targetRoomId, message)) {
        return;
      }

      synced = true;
      resolveSync(true);
    } catch (error) {
      lastError = error;
    }
  });

  try {
    while (!synced && Date.now() < deadline) {
      try {
        await sendSyncRequest(targetRoomId);
      } catch (error) {
        lastError = error;
      }

      if (synced) {
        return true;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      await Promise.race([
        syncPromise,
        sleep(Math.min(retryIntervalMs, remainingMs)),
      ]);
    }
  } finally {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }

  if (synced) {
    return true;
  }

  const detail = lastError ? `: ${lastError.message || lastError}` : '';
  throw new Error(`Timed out waiting for live session sync${detail}`);
}