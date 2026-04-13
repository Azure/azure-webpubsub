function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function ensureSessionOpenSync(roomId, {
  replayHistory,
  waitForLiveState,
  sessionMeta = { sessionId: roomId },
  timeoutMs = 4000,
  historyOptions = { maxCount: 100, skipStartupEnvelopes: true },
  hasLiveRoomJoin,
  onWaitingForLiveState,
}) {
  const historyHasSyncEvidence = await replayHistory(roomId, sessionMeta, historyOptions);
  const requiresLiveState = typeof hasLiveRoomJoin === 'function'
    ? !hasLiveRoomJoin(roomId)
    : false;

  if (historyHasSyncEvidence && !requiresLiveState) {
    return { historyHasSyncEvidence: true };
  }

  if (typeof onWaitingForLiveState === 'function') {
    onWaitingForLiveState();
  }

  await waitForLiveState(roomId, timeoutMs, sessionMeta);
  return { historyHasSyncEvidence: false };
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
  checkHistoryForSyncEvidence,
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

      if (!synced && typeof checkHistoryForSyncEvidence === 'function') {
        try {
          if (await checkHistoryForSyncEvidence(targetRoomId)) {
            synced = true;
            resolveSync(true);
            return true;
          }
        } catch (error) {
          lastError = error;
        }
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

      if (!synced && typeof checkHistoryForSyncEvidence === 'function') {
        try {
          if (await checkHistoryForSyncEvidence(targetRoomId)) {
            synced = true;
            resolveSync(true);
            return true;
          }
        } catch (error) {
          lastError = error;
        }
      }
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