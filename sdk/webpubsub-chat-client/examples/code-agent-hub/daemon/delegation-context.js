const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'expired']);
const MAX_STORED_ENTRIES = 6;
const MAX_VISIBLE_ENTRIES = 2;
const MAX_PROMPT_CHARS = 240;
const MAX_SUMMARY_CHARS = 1600;

function normalizeText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function clipText(value, maxChars) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeStatus(type) {
  const normalizedType = normalizeText(type);
  if (normalizedType === 'delegation.completed') return 'completed';
  if (normalizedType === 'delegation.failed') return 'failed';
  if (normalizedType === 'delegation.cancelled') return 'cancelled';
  if (normalizedType === 'delegation.expired') return 'expired';
  if (normalizedType === 'delegation.started') return 'started';
  if (normalizedType === 'delegation.dispatched') return 'dispatched';
  if (normalizedType === 'delegation.prompt') return 'creating';
  return '';
}

function compareEntries(left, right) {
  return String(right?.updatedAt || '').localeCompare(String(left?.updatedAt || ''));
}

function formatIndentedBlock(text, indent = '    ') {
  return normalizeText(text)
    .split('\n')
    .filter(Boolean)
    .map((line) => `${indent}${line}`);
}

export function upsertDelegationContextEntries(existingEntries = [], envelope = {}) {
  const delegationId = normalizeText(envelope?.delegationId);
  if (!delegationId) {
    return Array.isArray(existingEntries) ? [...existingEntries] : [];
  }

  const nextEntries = Array.isArray(existingEntries)
    ? existingEntries.map((entry) => ({ ...entry }))
    : [];

  let entry = nextEntries.find((candidate) => candidate.delegationId === delegationId);
  if (!entry) {
    entry = {
      delegationId,
      sourceSessionId: '',
      targetSessionId: '',
      targetLabel: '',
      prompt: '',
      status: '',
      summary: '',
      error: '',
      updatedAt: '',
    };
    nextEntries.push(entry);
  }

  entry.sourceSessionId = normalizeText(envelope?.sourceSessionId) || entry.sourceSessionId;
  entry.targetSessionId = normalizeText(envelope?.targetSessionId) || entry.targetSessionId;
  entry.targetLabel = normalizeText(envelope?.targetLabel) || entry.targetLabel;

  const status = normalizeStatus(envelope?.type);
  if (status) {
    entry.status = status;
  }

  if (normalizeText(envelope?.type) === 'delegation.prompt') {
    const prompt = clipText(envelope?.message, MAX_PROMPT_CHARS);
    if (prompt) {
      entry.prompt = prompt;
    }
  }

  const summaryText = clipText(envelope?.summary?.finalContent, MAX_SUMMARY_CHARS);
  if (summaryText) {
    entry.summary = summaryText;
  }

  if (status === 'completed') {
    entry.error = '';
  } else if (TERMINAL_STATUSES.has(status)) {
    const errorText = clipText(envelope?.message || envelope?.summary?.finalContent, MAX_SUMMARY_CHARS);
    if (errorText) {
      entry.error = errorText;
    }
  }

  entry.updatedAt = normalizeText(envelope?.createdAt) || new Date().toISOString();

  return nextEntries
    .sort(compareEntries)
    .slice(0, MAX_STORED_ENTRIES);
}

export function buildDelegationContextPrompt(prompt, entries = [], { maxEntries = MAX_VISIBLE_ENTRIES } = {}) {
  const currentPrompt = normalizeText(prompt);
  if (!currentPrompt) return currentPrompt;

  const terminalEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => TERMINAL_STATUSES.has(normalizeText(entry?.status)) && (normalizeText(entry?.summary) || normalizeText(entry?.error)))
    .sort(compareEntries)
    .slice(0, Math.max(1, Number(maxEntries) || MAX_VISIBLE_ENTRIES));

  if (!terminalEntries.length) {
    return currentPrompt;
  }

  const lines = [
    'Recent delegated findings from other sessions in this conversation:',
  ];

  for (const entry of terminalEntries) {
    const label = normalizeText(entry.targetLabel) || normalizeText(entry.targetSessionId) || normalizeText(entry.delegationId) || 'Cross-Agent Communication';
    const status = normalizeText(entry.status) || 'completed';
    lines.push(`- Target: ${label} (${status})`);
    if (normalizeText(entry.prompt)) {
      lines.push(`  Delegated task: ${entry.prompt}`);
    }
    if (normalizeText(entry.summary)) {
      lines.push('  Result:');
      lines.push(...formatIndentedBlock(entry.summary));
    }
    if (normalizeText(entry.error)) {
      lines.push(`  Notes: ${entry.error}`);
    }
  }

  lines.push('Use these delegated findings when they are relevant to the next user request.');
  lines.push('');
  lines.push('Current user request:');
  lines.push(currentPrompt);
  return lines.join('\n');
}