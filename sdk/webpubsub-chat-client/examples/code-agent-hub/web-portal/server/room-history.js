export function isRoomHistoryPermissionError(error) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  if (statusCode === 403) return true;
  const message = String(error?.message || '').toLowerCase();
  const errorName = String(error?.errorDetail?.name || error?.name || '').toLowerCase();
  return errorName === 'nopermissioninroom'
    || message.includes('nopermissioninroom')
    || message.includes('read history')
    || message.includes('permission in room')
    || message.includes('forbidden');
}

export function normalizeMessagePage(payload, baseUrl = 'http://localhost') {
  const messages = Array.isArray(payload?.messages)
    ? payload.messages
    : Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [];

  let nextQuery = null;
  const rawNextQuery = payload?.nextQuery && typeof payload.nextQuery === 'object'
    ? payload.nextQuery
    : payload?.next && typeof payload.next === 'object'
      ? payload.next
      : null;
  if (rawNextQuery) {
    nextQuery = {
      start: rawNextQuery.start ?? null,
      end: rawNextQuery.end ?? null,
    };
  } else if (typeof payload?.nextLink === 'string' && payload.nextLink) {
    try {
      const nextUrl = new URL(payload.nextLink, baseUrl);
      nextQuery = {
        start: nextUrl.searchParams.get('start'),
        end: nextUrl.searchParams.get('end'),
      };
    } catch {
      nextQuery = null;
    }
  }

  return { messages, nextQuery };
}

export async function listRoomMessagesWithFallback({
  roomId,
  maxCount = 200,
  baseUrl,
  loadPrimaryPage,
  loadRoomInfo,
  loadConversationPage,
}) {
  const targetCount = Math.max(1, Number(maxCount) || 1);
  const allMessages = [];
  const seenQueries = new Set();
  let startId = null;
  let endId = null;
  let fallbackConversationId = '';

  while (allMessages.length < targetCount) {
    const pageSize = Math.min(100, targetCount - allMessages.length);
    let page;

    try {
      page = await loadPrimaryPage(roomId, startId, endId, pageSize);
    } catch (error) {
      if (!isRoomHistoryPermissionError(error)) throw error;
      if (!fallbackConversationId) {
        const roomInfo = await loadRoomInfo(roomId);
        fallbackConversationId = String(roomInfo?.defaultConversationId || '').trim();
        if (!fallbackConversationId) throw error;
      }
      page = await loadConversationPage(fallbackConversationId, startId, endId, pageSize);
    }

    const { messages = [], nextQuery } = normalizeMessagePage(page, baseUrl);
    allMessages.push(...messages);

    if (!messages.length || !nextQuery) break;

    const nextStartId = nextQuery.start ?? null;
    const nextEndId = nextQuery.end ?? null;
    const queryKey = `${nextStartId ?? ''}|${nextEndId ?? ''}|${pageSize}`;
    if (seenQueries.has(queryKey)) break;

    seenQueries.add(queryKey);
    startId = nextStartId;
    endId = nextEndId;
  }

  return allMessages.slice(0, targetCount);
}