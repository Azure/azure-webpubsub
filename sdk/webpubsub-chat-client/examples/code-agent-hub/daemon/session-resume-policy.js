const AUTO_RESUME_ENVELOPE_TYPES = new Set([
  'user.prompt',
  'user.command',
  'session.sync_state',
  'control.delegation.request',
]);

export function shouldTryAutoResumeSession(state, envelopeType) {
  const type = String(envelopeType || '').trim();
  return (!state || state.active === false) && AUTO_RESUME_ENVELOPE_TYPES.has(type);
}
