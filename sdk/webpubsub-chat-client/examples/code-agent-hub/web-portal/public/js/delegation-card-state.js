const DEFAULT_DELEGATION_CARD_PROMPT_PREVIEW_CHARS = 160;
const DEFAULT_DELEGATION_CARD_META_PREVIEW_CHARS = 140;

function nextTimelineItemId(state) {
  const id = `timeline-${state.nextTimelineItemId}`;
  state.nextTimelineItemId += 1;
  return id;
}

function normalizeCardPreviewText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTimelineContent(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasSameTimelineContent(left, right) {
  const normalizedLeft = normalizeTimelineContent(left);
  const normalizedRight = normalizeTimelineContent(right);
  return !!normalizedLeft && normalizedLeft === normalizedRight;
}

function mergeStreamingText(currentContent, nextContent) {
  const current = String(currentContent || '');
  const next = String(nextContent || '');
  if (!next) {
    return { content: current, changed: false };
  }
  if (!current) {
    return { content: next, changed: true };
  }
  if (current === next) {
    return { content: current, changed: false };
  }
  if (next.startsWith(current)) {
    return { content: next, changed: true };
  }
  if (current.endsWith(next)) {
    return { content: current, changed: false };
  }

  const maxOverlap = Math.min(current.length, next.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (current.slice(-overlap) === next.slice(0, overlap)) {
      const merged = `${current}${next.slice(overlap)}`;
      return { content: merged, changed: merged !== current };
    }
  }

  return { content: `${current}${next}`, changed: true };
}

function truncateCardPreviewText(value, maxChars) {
  const normalized = normalizeCardPreviewText(value);
  const normalizedMaxChars = Math.max(8, Number(maxChars) || 0);
  if (!normalized) return '';
  if (normalized.length <= normalizedMaxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, normalizedMaxChars - 1)).trimEnd()}…`;
}

export function formatDelegationUsagePreview(usage) {
  const used = Number(usage?.used);
  const size = Number(usage?.size);
  const hasUsed = Number.isFinite(used);
  const hasSize = Number.isFinite(size);
  if (hasUsed && hasSize && used === 0 && size === 0) return '';
  if (!hasUsed && !hasSize) return '';
  return `${hasUsed ? used : '?'}\/${hasSize ? size : '?'} tokens`;
}

export function buildDelegationCardMetaText({ model = '', usage, error = '' } = {}) {
  const parts = [];
  const normalizedModel = normalizeCardPreviewText(model);
  const normalizedError = String(error || '').trim();

  if (normalizedModel) parts.push(`model ${normalizedModel}`);

  const usagePreview = formatDelegationUsagePreview(usage);
  if (usagePreview) parts.push(usagePreview);

  if (normalizedError) parts.push(normalizedError);

  return parts.join(' · ');
}

export function hasDelegationCardTimelineContent(items = []) {
  const timelineItems = Array.isArray(items)
    ? items
    : Array.isArray(items?.items)
      ? items.items
      : [];

  return timelineItems.some((item) => {
    if (!item || typeof item !== 'object') return false;
    if (item.kind === 'tool') return true;
    return !!String(item.content || '').trim();
  });
}

export function getDelegationCardSectionState({
  prompt = '',
  model = '',
  usage,
  error = '',
  timelineItems = [],
  targetSessionId = '',
  delegationId = '',
  status = '',
} = {}) {
  const metaText = buildDelegationCardMetaText({ model, usage, error });
  const normalizedPrompt = String(prompt || '').trim();
  const normalizedTargetSessionId = String(targetSessionId || '').trim();
  const normalizedDelegationId = String(delegationId || '').trim();
  const normalizedStatus = String(status || '').trim();
  const terminal = /^(completed|failed|cancelled|expired)$/.test(normalizedStatus);
  const showPrompt = !!normalizedPrompt;
  const showMeta = !!metaText;
  const showBody = hasDelegationCardTimelineContent(timelineItems);
  const showOpenTarget = !!normalizedTargetSessionId;
  const showCancel = !!normalizedDelegationId && !terminal;
  const showActions = showOpenTarget || showCancel;

  return {
    metaText,
    showPrompt,
    showMeta,
    showBody,
    showOpenTarget,
    showCancel,
    showActions,
    showDetail: showPrompt || showMeta || showBody || showActions,
  };
}

function getTimelineItem(state, itemId) {
  return state.items.find((item) => item.id === itemId) || null;
}

function getLastTimelineItem(state) {
  return state.items[state.items.length - 1] || null;
}

function getLastTimelineItemByKind(state, kind) {
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item?.kind === kind) return item;
  }
  return null;
}

function getLastStreamingTimelineItemByKind(state, kind) {
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item?.kind === kind && item.streaming) return item;
  }
  return null;
}

function closeAssistantItem(state) {
  const item = getTimelineItem(state, state.openAssistantItemId);
  if (item?.kind === 'assistant') item.streaming = false;
  state.openAssistantItemId = '';
}

function closeReasoningItem(state) {
  const item = getTimelineItem(state, state.openReasoningItemId);
  if (item?.kind === 'reasoning') item.streaming = false;
  state.openReasoningItemId = '';
}

function appendAssistantItem(state) {
  const item = {
    id: nextTimelineItemId(state),
    kind: 'assistant',
    content: '',
    streaming: false,
  };
  state.items.push(item);
  state.openAssistantItemId = item.id;
  return item;
}

function appendReasoningItem(state) {
  const item = {
    id: nextTimelineItemId(state),
    kind: 'reasoning',
    content: '',
    streaming: false,
    expanded: true,
  };
  state.items.push(item);
  state.openReasoningItemId = item.id;
  return item;
}

function ensureAssistantItem(state) {
  return getTimelineItem(state, state.openAssistantItemId) || appendAssistantItem(state);
}

function ensureAssistantItemForKey(state, itemKey = '') {
  const normalizedItemKey = String(itemKey || '').trim();
  if (normalizedItemKey) {
    const existing = getTimelineItem(state, state.assistantItemIdByKey.get(normalizedItemKey));
    if (existing?.kind === 'assistant') {
      state.openAssistantItemId = existing.id;
      return existing;
    }
  }

  const item = ensureAssistantItem(state);
  if (normalizedItemKey) {
    item.messageKey = normalizedItemKey;
    state.assistantItemIdByKey.set(normalizedItemKey, item.id);
  }
  return item;
}

function ensureReasoningItem(state) {
  return getTimelineItem(state, state.openReasoningItemId) || appendReasoningItem(state);
}

function ensureReasoningItemForKey(state, itemKey = '') {
  const normalizedItemKey = String(itemKey || '').trim();
  if (normalizedItemKey) {
    const existing = getTimelineItem(state, state.reasoningItemIdByKey.get(normalizedItemKey));
    if (existing?.kind === 'reasoning') {
      state.openReasoningItemId = existing.id;
      return existing;
    }
  }

  const item = ensureReasoningItem(state);
  if (normalizedItemKey) {
    item.reasoningKey = normalizedItemKey;
    state.reasoningItemIdByKey.set(normalizedItemKey, item.id);
  }
  return item;
}

function appendToolItem(state, toolKey, name, signature) {
  const activeToolKeys = new Set();
  if (toolKey) activeToolKeys.add(toolKey);
  const item = {
    id: nextTimelineItemId(state),
    kind: 'tool',
    name,
    signature,
    repeatCount: 1,
    state: 'running',
    toolKeys: toolKey ? [toolKey] : [],
    activeToolKeys,
    completedToolKeys: new Set(),
    failedToolKeys: new Set(),
  };
  state.items.push(item);
  if (toolKey) {
    state.toolItemIdByKey.set(toolKey, item.id);
  }
  return item;
}

function canMergeToolItem(lastItem, signature) {
  return !!(
    signature
    && lastItem?.kind === 'tool'
    && lastItem.signature === signature
    && !(lastItem.failedToolKeys?.size > 0)
  );
}

function appendMergedToolKey(item, toolKey) {
  if (!item || !toolKey) return false;
  if (!item.toolKeys.includes(toolKey)) item.toolKeys.push(toolKey);
  if (item.completedToolKeys?.has(toolKey)) return false;
  const hadActiveKey = item.activeToolKeys?.has(toolKey);
  if (!hadActiveKey) item.activeToolKeys?.add(toolKey);
  return !hadActiveKey;
}

function finalizeToolItem(item, toolKey, success) {
  if (!item) return false;
  const succeeded = success !== false;
  let changed = false;

  if (toolKey) {
    const wasCompleted = item.completedToolKeys?.has(toolKey);
    if (!wasCompleted) {
      item.completedToolKeys?.add(toolKey);
      item.activeToolKeys?.delete(toolKey);
      if (!succeeded) item.failedToolKeys?.add(toolKey);
      changed = true;
    }
  } else {
    if (!succeeded) item.failedToolKeys?.add('__unknown__');
    if (item.activeToolKeys?.size) {
      item.activeToolKeys.clear();
      changed = true;
    }
  }

  const nextState = item.activeToolKeys?.size
    ? 'running'
    : item.failedToolKeys?.size
      ? 'failed'
      : 'done';
  if (item.state !== nextState) {
    item.state = nextState;
    changed = true;
  }

  return changed;
}

function ensureToolItem(state, toolKey, name, signature, { allowMerge = false } = {}) {
  const existing = toolKey ? getTimelineItem(state, state.toolItemIdByKey.get(toolKey)) : null;
  if (existing) {
    if (name) existing.name = name;
    if (signature) existing.signature = signature;
    return existing;
  }

  const lastItem = getLastTimelineItem(state);
  if (
    allowMerge
    && canMergeToolItem(lastItem, signature)
  ) {
    const appendedToolKey = appendMergedToolKey(lastItem, toolKey);
    if (appendedToolKey || !toolKey) {
      lastItem.repeatCount += 1;
    }
    lastItem.state = 'running';
    if (toolKey) {
      state.toolItemIdByKey.set(toolKey, lastItem.id);
    }
    return lastItem;
  }

  return appendToolItem(state, toolKey, name, signature);
}

export function createDelegationCardState() {
  return {
    items: [],
    nextTimelineItemId: 1,
    toolItemIdByKey: new Map(),
    assistantItemIdByKey: new Map(),
    reasoningItemIdByKey: new Map(),
    openAssistantItemId: '',
    openReasoningItemId: '',
    collapsed: false,
  };
}

export function isDelegationCardCollapsed(state) {
  return !!state?.collapsed;
}

export function setDelegationCardCollapsed(state, collapsed) {
  if (!state || typeof state !== 'object') return false;
  state.collapsed = !!collapsed;
  return state.collapsed;
}

export function toggleDelegationCardCollapsed(state) {
  return setDelegationCardCollapsed(state, !isDelegationCardCollapsed(state));
}

export function buildDelegationCardHeaderSummary({
  prompt = '',
  model = '',
  usage,
  error = '',
  maxPromptChars = DEFAULT_DELEGATION_CARD_PROMPT_PREVIEW_CHARS,
  maxMetaChars = DEFAULT_DELEGATION_CARD_META_PREVIEW_CHARS,
} = {}) {
  const promptPreview = truncateCardPreviewText(prompt, maxPromptChars);
  const errorPreview = truncateCardPreviewText(error, maxMetaChars);
  if (errorPreview) {
    return {
      promptPreview,
      metaPreview: errorPreview,
    };
  }

  return {
    promptPreview,
    metaPreview: truncateCardPreviewText(buildDelegationCardMetaText({ model, usage }), maxMetaChars),
  };
}

export function setDelegationCardReasoningExpanded(state, itemId, expanded) {
  const item = getTimelineItem(state, itemId);
  if (!item || item.kind !== 'reasoning') return false;
  item.expanded = !!expanded;
  return true;
}

export function hasDelegationCardAssistantContent(state) {
  return state.items.some((item) => item.kind === 'assistant' && String(item.content || '').trim());
}

export function ensureDelegationCardSummaryContent(state, content) {
  const text = String(content || '');
  if (!text.trim() || hasDelegationCardAssistantContent(state)) return false;
  closeAssistantItem(state);
  closeReasoningItem(state);
  const item = appendAssistantItem(state);
  item.content = text;
  item.streaming = false;
  closeAssistantItem(state);
  return true;
}

export function settleDelegationCardToolItems(state, success = true) {
  if (!state?.items?.length) return false;

  let changed = false;
  for (const item of state.items) {
    if (item?.kind !== 'tool') continue;
    if (item.state !== 'running' && !(item.activeToolKeys?.size > 0)) continue;
    changed = finalizeToolItem(item, '', success) || changed;
  }
  return changed;
}

export function finalizeDelegationCardStreamingItems(state) {
  if (!state?.items?.length) {
    state.openAssistantItemId = '';
    state.openReasoningItemId = '';
    return false;
  }

  let changed = false;
  for (const item of state.items) {
    if ((item.kind === 'assistant' || item.kind === 'reasoning') && item.streaming) {
      item.streaming = false;
      changed = true;
    }
  }
  state.openAssistantItemId = '';
  state.openReasoningItemId = '';
  return changed;
}

export function reconcileDelegationCardTerminalSummaryContent(state, content) {
  const text = String(content || '');
  if (!text.trim()) return false;

  const streamingAssistant = getLastStreamingTimelineItemByKind(state, 'assistant');
  if (streamingAssistant) {
    const nextContent = text.startsWith(streamingAssistant.content)
      ? text
      : mergeStreamingText(streamingAssistant.content, text).content;
    const changed = streamingAssistant.content !== nextContent || streamingAssistant.streaming;
    streamingAssistant.content = nextContent;
    streamingAssistant.streaming = false;
    if (state.openAssistantItemId === streamingAssistant.id) state.openAssistantItemId = '';
    return changed;
  }

  const lastAssistant = getLastTimelineItemByKind(state, 'assistant');
  if (
    lastAssistant
    && text.length > String(lastAssistant.content || '').length
    && text.startsWith(String(lastAssistant.content || ''))
  ) {
    const changed = lastAssistant.content !== text || lastAssistant.streaming;
    lastAssistant.content = text;
    lastAssistant.streaming = false;
    return changed;
  }

  return ensureDelegationCardSummaryContent(state, text);
}

export function applyDelegationCardRelayEvent(state, streamType, payload = {}) {
  const type = String(streamType || '').trim();
  if (!type) return false;

  if (type === 'assistant.message_delta') {
    const chunk = String(payload.content || payload.deltaContent || '');
    const messageKey = String(payload.messageId || '').trim();
    if (!chunk) return false;
    closeReasoningItem(state);
    const item = ensureAssistantItemForKey(state, messageKey);
    const nextContent = mergeStreamingText(item.content, chunk);
    item.content = nextContent.content;
    item.streaming = true;
    return nextContent.changed;
  }

  if (type === 'assistant.message') {
    const content = String(payload.content || '');
    const messageKey = String(payload.messageId || '').trim();
    closeReasoningItem(state);
    const item = ensureAssistantItemForKey(state, messageKey) || (content ? appendAssistantItem(state) : null);
    if (!item) return false;
    const previousContent = item.content;
    const wasStreaming = item.streaming;
    if (content) {
      const nextContent = mergeStreamingText(item.content, content);
      item.content = nextContent.content;
    }
    item.streaming = false;
    closeAssistantItem(state);
    if (!previousContent && !content) return false;
    if (state.items.length >= 2) {
      const previousItem = state.items[state.items.length - 2];
      const lastItem = state.items[state.items.length - 1];
      if (
        previousItem?.kind === 'assistant'
        && lastItem?.kind === 'assistant'
        && hasSameTimelineContent(previousItem.content, lastItem.content)
      ) {
        state.items.pop();
        return true;
      }
    }
    return wasStreaming || previousContent !== item.content;
  }

  if (type === 'assistant.reasoning_delta') {
    const chunk = String(payload.content || payload.deltaContent || '');
    const reasoningKey = String(payload.reasoningId || '').trim();
    if (!chunk) return false;
    closeAssistantItem(state);
    const item = ensureReasoningItemForKey(state, reasoningKey);
    const nextContent = mergeStreamingText(item.content, chunk);
    item.content = nextContent.content;
    item.streaming = true;
    item.expanded = true;
    return nextContent.changed;
  }

  if (type === 'assistant.reasoning') {
    const content = String(payload.content || '');
    const reasoningKey = String(payload.reasoningId || '').trim();
    closeAssistantItem(state);
    const item = ensureReasoningItemForKey(state, reasoningKey) || (content ? appendReasoningItem(state) : null);
    if (!item) return false;
    const previousContent = item.content;
    const wasStreaming = item.streaming;
    if (content) {
      const nextContent = mergeStreamingText(item.content, content);
      item.content = nextContent.content;
    }
    item.streaming = false;
    closeReasoningItem(state);
    if (!previousContent && !content) return false;
    if (state.items.length >= 2) {
      const previousItem = state.items[state.items.length - 2];
      const lastItem = state.items[state.items.length - 1];
      if (
        previousItem?.kind === 'reasoning'
        && lastItem?.kind === 'reasoning'
        && hasSameTimelineContent(previousItem.content, lastItem.content)
      ) {
        state.items.pop();
        return true;
      }
    }
    return wasStreaming || previousContent !== item.content;
  }

  if (type === 'tool.start') {
    closeAssistantItem(state);
    closeReasoningItem(state);
    const toolKey = String(payload.toolCallId || payload.name || `tool-${state.items.length + 1}`);
    const toolName = String(payload.name || 'Tool').trim() || 'Tool';
    const signature = String(payload.signature || '').trim();
    ensureToolItem(state, toolKey, toolName, signature, { allowMerge: true });
    return true;
  }

  if (type === 'tool.complete') {
    closeAssistantItem(state);
    closeReasoningItem(state);
    const toolKey = String(payload.toolCallId || payload.name || `tool-${state.items.length + 1}`);
    const toolName = String(payload.name || 'Tool').trim() || 'Tool';
    const signature = String(payload.signature || '').trim();
    const item = ensureToolItem(state, toolKey, toolName, signature, { allowMerge: false });
    return finalizeToolItem(item, toolKey, payload.success);
  }

  return false;
}