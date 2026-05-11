export const DELEGATION_CONTROL_ROOM_ID = 'delegation-control';

const SUMMARY_TYPES = new Set([
  'delegation.prompt',
  'delegation.dispatched',
  'delegation.started',
  'delegation.completed',
  'delegation.failed',
  'delegation.cancelled',
  'delegation.expired',
]);

const CONTROL_TYPES = new Set([
  'control.delegation.created',
  'control.delegation.dispatched',
  'control.delegation.started',
  'control.delegation.cancel_requested',
  'control.delegation.completed',
  'control.delegation.failed',
  'control.delegation.cancelled',
  'control.delegation.expired',
]);

const TARGET_CONTROL_TYPES = new Set([
  'control.delegation.request',
  'control.delegation.cancel',
]);

export function buildDelegationRelayRoomId(delegationId) {
  const normalizedDelegationId = String(delegationId || '').trim();
  return normalizedDelegationId ? `delegation-relay-${normalizedDelegationId}` : '';
}

export function isDelegationSummaryType(type) {
  return SUMMARY_TYPES.has(String(type || '').trim());
}

export function isDelegationControlType(type) {
  return CONTROL_TYPES.has(String(type || '').trim());
}

export function isDelegationTargetControlType(type) {
  return TARGET_CONTROL_TYPES.has(String(type || '').trim());
}

export function isDelegationTerminalStatus(status) {
  const normalizedStatus = String(status || '').trim();
  return normalizedStatus === 'completed'
    || normalizedStatus === 'failed'
    || normalizedStatus === 'cancelled'
    || normalizedStatus === 'expired';
}

export function summaryTypeForTerminalStatus(status) {
  const normalizedStatus = String(status || '').trim();
  if (normalizedStatus === 'completed') return 'delegation.completed';
  if (normalizedStatus === 'failed') return 'delegation.failed';
  if (normalizedStatus === 'cancelled') return 'delegation.cancelled';
  if (normalizedStatus === 'expired') return 'delegation.expired';
  return '';
}

export function controlTypeForTerminalStatus(status) {
  const normalizedStatus = String(status || '').trim();
  if (normalizedStatus === 'completed') return 'control.delegation.completed';
  if (normalizedStatus === 'failed') return 'control.delegation.failed';
  if (normalizedStatus === 'cancelled') return 'control.delegation.cancelled';
  if (normalizedStatus === 'expired') return 'control.delegation.expired';
  return '';
}

export function terminalStatusForRelayStreamType(streamType) {
  const normalizedStreamType = String(streamType || '').trim();
  if (normalizedStreamType === 'terminal.completed') return 'completed';
  if (normalizedStreamType === 'terminal.failed') return 'failed';
  if (normalizedStreamType === 'terminal.cancelled') return 'cancelled';
  return '';
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  const used = Number(usage.used);
  const size = Number(usage.size);
  const nextUsage = {};
  if (Number.isFinite(used)) nextUsage.used = used;
  if (Number.isFinite(size)) nextUsage.size = size;
  return Object.keys(nextUsage).length ? nextUsage : undefined;
}

export function buildDelegationSummaryEnvelope(payload = {}) {
  const type = String(payload.type || '').trim();
  return {
    type,
    delegationId: String(payload.delegationId || '').trim(),
    relayRoomId: String(payload.relayRoomId || '').trim(),
    sourceSessionId: String(payload.sourceSessionId || '').trim(),
    targetSessionId: String(payload.targetSessionId || '').trim(),
    targetLabel: String(payload.targetLabel || '').trim(),
    message: payload.message == null ? undefined : String(payload.message),
    summary: payload.summary && typeof payload.summary === 'object'
      ? {
        finalContent: payload.summary.finalContent == null ? undefined : String(payload.summary.finalContent),
        model: payload.summary.model == null ? undefined : String(payload.summary.model),
        usage: normalizeUsage(payload.summary.usage),
      }
      : undefined,
    createdAt: String(payload.createdAt || '').trim() || new Date().toISOString(),
  };
}

export function parseDelegationSummaryEnvelope(text) {
  try {
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    if (!isDelegationSummaryType(parsed?.type)) return null;
    const envelope = buildDelegationSummaryEnvelope(parsed);
    if (!envelope.delegationId || !envelope.sourceSessionId || !envelope.targetSessionId) return null;
    return envelope;
  } catch {
    return null;
  }
}

export function buildDelegationControlEnvelope(payload = {}) {
  const type = String(payload.type || '').trim();
  return {
    type,
    delegationId: String(payload.delegationId || '').trim(),
    sourceSessionId: String(payload.sourceSessionId || '').trim(),
    targetSessionId: String(payload.targetSessionId || '').trim(),
    relayRoomId: String(payload.relayRoomId || '').trim(),
    requesterUserId: String(payload.requesterUserId || '').trim(),
    targetDaemonId: String(payload.targetDaemonId || '').trim(),
    createdAt: String(payload.createdAt || '').trim() || new Date().toISOString(),
    data: payload.data && typeof payload.data === 'object' ? payload.data : undefined,
  };
}

export function parseDelegationControlEnvelope(text) {
  try {
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    if (!isDelegationControlType(parsed?.type)) return null;
    const envelope = buildDelegationControlEnvelope(parsed);
    if (!envelope.delegationId || !envelope.sourceSessionId || !envelope.targetSessionId || !envelope.targetDaemonId) return null;
    return envelope;
  } catch {
    return null;
  }
}

export function buildDelegationTargetControlEnvelope(payload = {}) {
  const type = String(payload.type || '').trim();
  return {
    type,
    delegationId: String(payload.delegationId || '').trim(),
    sourceSessionId: String(payload.sourceSessionId || '').trim(),
    targetSessionId: String(payload.targetSessionId || '').trim(),
    relayRoomId: String(payload.relayRoomId || '').trim(),
    requesterUserId: String(payload.requesterUserId || '').trim(),
    targetDaemonId: String(payload.targetDaemonId || '').trim(),
    createdAt: String(payload.createdAt || '').trim() || new Date().toISOString(),
    prompt: payload.prompt == null ? undefined : String(payload.prompt),
    displayText: payload.displayText == null ? undefined : String(payload.displayText),
    resumeFromSeq: Number.isFinite(Number(payload.resumeFromSeq)) ? Number(payload.resumeFromSeq) : undefined,
  };
}

export function parseDelegationTargetControlEnvelope(text) {
  try {
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    if (!isDelegationTargetControlType(parsed?.type)) return null;
    const envelope = buildDelegationTargetControlEnvelope(parsed);
    if (!envelope.delegationId || !envelope.targetSessionId || !envelope.targetDaemonId) return null;
    return envelope;
  } catch {
    return null;
  }
}

export function buildDelegationRelayEnvelope(payload = {}) {
  return {
    type: 'delegation.stream.event',
    delegationId: String(payload.delegationId || '').trim(),
    relayRoomId: String(payload.relayRoomId || '').trim(),
    seq: Number(payload.seq) || 0,
    sourceSessionId: String(payload.sourceSessionId || '').trim(),
    targetSessionId: String(payload.targetSessionId || '').trim(),
    targetDaemonId: String(payload.targetDaemonId || '').trim(),
    streamType: String(payload.streamType || '').trim(),
    payload: payload.payload && typeof payload.payload === 'object' ? payload.payload : {},
    sentAt: String(payload.sentAt || '').trim() || new Date().toISOString(),
  };
}

export function parseDelegationRelayEnvelope(text) {
  try {
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    if (parsed?.type !== 'delegation.stream.event') return null;
    const envelope = buildDelegationRelayEnvelope(parsed);
    if (!envelope.delegationId || !envelope.relayRoomId || !envelope.targetSessionId || !envelope.targetDaemonId || !envelope.streamType || envelope.seq < 1) {
      return null;
    }
    return envelope;
  } catch {
    return null;
  }
}
