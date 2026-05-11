import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTryAutoResumeSession } from '../daemon/session-resume-policy.js';

describe('session resume policy helpers', () => {
  it('auto-resumes inactive sessions for user prompts and delegation requests', () => {
    assert.equal(shouldTryAutoResumeSession(null, 'user.prompt'), true);
    assert.equal(shouldTryAutoResumeSession({ active: false }, 'control.delegation.request'), true);
  });

  it('does not auto-resume active sessions or unrelated control envelopes', () => {
    assert.equal(shouldTryAutoResumeSession({ active: true }, 'control.delegation.request'), false);
    assert.equal(shouldTryAutoResumeSession({ active: false }, 'control.delegation.cancel'), false);
    assert.equal(shouldTryAutoResumeSession({ active: false }, 'delegation.dispatched'), false);
  });
});
