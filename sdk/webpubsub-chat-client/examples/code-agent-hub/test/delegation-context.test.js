import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDelegationSummaryEnvelope } from '../session-delegation.js';
import { buildDelegationContextPrompt, upsertDelegationContextEntries } from '../delegation-context.js';

describe('delegation context helpers', () => {
  it('keeps the delegated task and completed result together', () => {
    let entries = upsertDelegationContextEntries([], buildDelegationSummaryEnvelope({
      type: 'delegation.prompt',
      delegationId: 'delegation-1',
      sourceSessionId: 'source-1',
      targetSessionId: 'target-1',
      targetLabel: 'acp-ui (copilot) @ desktop',
      message: 'Inspect the repo tech stack',
      createdAt: '2026-04-15T12:00:00.000Z',
    }));

    entries = upsertDelegationContextEntries(entries, buildDelegationSummaryEnvelope({
      type: 'delegation.completed',
      delegationId: 'delegation-1',
      sourceSessionId: 'source-1',
      targetSessionId: 'target-1',
      targetLabel: 'acp-ui (copilot) @ desktop',
      summary: {
        finalContent: 'Vite 6, Pinia, vue-router, marked, Tauri plugin dialog.',
      },
      createdAt: '2026-04-15T12:00:05.000Z',
    }));

    assert.deepEqual(entries, [{
      delegationId: 'delegation-1',
      sourceSessionId: 'source-1',
      targetSessionId: 'target-1',
      targetLabel: 'acp-ui (copilot) @ desktop',
      prompt: 'Inspect the repo tech stack',
      status: 'completed',
      summary: 'Vite 6, Pinia, vue-router, marked, Tauri plugin dialog.',
      error: '',
      updatedAt: '2026-04-15T12:00:05.000Z',
    }]);
  });

  it('injects only terminal delegation findings into the next prompt', () => {
    const entries = [
      {
        delegationId: 'delegation-2',
        targetLabel: 'acp-ui (copilot) @ desktop',
        prompt: 'Inspect the repo tech stack',
        status: 'completed',
        summary: 'The repo uses Vite 6, Pinia, and vue-router.',
        error: '',
        updatedAt: '2026-04-15T12:05:00.000Z',
      },
      {
        delegationId: 'delegation-3',
        targetLabel: 'other-target',
        prompt: 'Still running',
        status: 'started',
        summary: '',
        error: '',
        updatedAt: '2026-04-15T12:06:00.000Z',
      },
    ];

    const composed = buildDelegationContextPrompt('Do you know the routing setup in that repo?', entries);

    assert.match(composed, /Recent delegated findings from other sessions/);
    assert.match(composed, /acp-ui \(copilot\) @ desktop/);
    assert.match(composed, /Vite 6, Pinia, and vue-router/);
    assert.doesNotMatch(composed, /Still running/);
    assert.match(composed, /Current user request:\nDo you know the routing setup in that repo\?/);
  });

  it('limits the prompt to the most recent terminal delegation findings', () => {
    const entries = [
      { delegationId: 'd1', targetLabel: 'target-1', prompt: 'task-1', status: 'completed', summary: 'result-1', error: '', updatedAt: '2026-04-15T12:01:00.000Z' },
      { delegationId: 'd2', targetLabel: 'target-2', prompt: 'task-2', status: 'completed', summary: 'result-2', error: '', updatedAt: '2026-04-15T12:02:00.000Z' },
      { delegationId: 'd3', targetLabel: 'target-3', prompt: 'task-3', status: 'completed', summary: 'result-3', error: '', updatedAt: '2026-04-15T12:03:00.000Z' },
    ];

    const composed = buildDelegationContextPrompt('Follow up', entries);

    assert.match(composed, /target-3/);
    assert.match(composed, /target-2/);
    assert.doesNotMatch(composed, /target-1/);
  });
});