import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDelegationCardRelayEvent,
  buildDelegationCardHeaderSummary,
  createDelegationCardState,
  ensureDelegationCardSummaryContent,
  finalizeDelegationCardStreamingItems,
  hasDelegationCardAssistantContent,
  isDelegationCardCollapsed,
  reconcileDelegationCardTerminalSummaryContent,
  settleDelegationCardToolItems,
  setDelegationCardCollapsed,
  setDelegationCardReasoningExpanded,
  toggleDelegationCardCollapsed,
} from '../public/delegation-card-state.js';

describe('delegation card state helpers', () => {
  it('builds a collapsed header summary and tracks collapsed state', () => {
    const state = createDelegationCardState();

    assert.equal(isDelegationCardCollapsed(state), false);
    assert.equal(toggleDelegationCardCollapsed(state), true);
    assert.equal(setDelegationCardCollapsed(state, false), false);

    assert.deepEqual(buildDelegationCardHeaderSummary({
      prompt: 'reply only relay-ok-20260415-1644',
      model: 'claude-sonnet-4.6',
      usage: { used: 0, size: 0 },
    }), {
      promptPreview: 'reply only relay-ok-20260415-1644',
      metaPreview: 'model claude-sonnet-4.6 · 0/0 tokens',
    });

    assert.deepEqual(buildDelegationCardHeaderSummary({
      prompt: 'inspect the relay failure',
      model: 'claude-sonnet-4.6',
      error: 'MaxCount must be between 1 and 100',
    }), {
      promptPreview: 'inspect the relay failure',
      metaPreview: 'MaxCount must be between 1 and 100',
    });
  });

  it('keeps visible events ordered instead of grouping tools after messages', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { content: 'Plan: inspect config.' });
    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\npackage.json' });
    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { content: 'Found the package metadata.' });

    assert.deepEqual(state.items.map((item) => item.kind), ['assistant', 'tool', 'assistant']);
    assert.equal(state.items[0].content, 'Plan: inspect config.');
    assert.equal(state.items[1].name, 'read_file');
    assert.equal(state.items[2].content, 'Found the package metadata.');
  });

  it('merges only immediately consecutive identical tool starts', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-1', name: 'grep_search', signature: 'grep_search\nfoo' });
    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-2', name: 'grep_search', signature: 'grep_search\nfoo' });
    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { content: 'Saw a match.' });
    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-3', name: 'grep_search', signature: 'grep_search\nfoo' });

    assert.deepEqual(state.items.map((item) => item.kind), ['tool', 'assistant', 'tool']);
    assert.equal(state.items[0].repeatCount, 2);
    assert.equal(state.items[2].repeatCount, 1);
  });

  it('keeps merged tool rows running until the last identical call completes', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\npackage.json' });
    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-2', name: 'read_file', signature: 'read_file\npackage.json' });
    applyDelegationCardRelayEvent(state, 'tool.complete', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\npackage.json', success: true });

    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].repeatCount, 2);
    assert.equal(state.items[0].state, 'running');

    applyDelegationCardRelayEvent(state, 'tool.complete', { toolCallId: 'tool-2', name: 'read_file', signature: 'read_file\npackage.json', success: true });

    assert.equal(state.items[0].state, 'done');
  });

  it('merges adjacent identical completed tool runs without assistant output in between', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\nREADME.md' });
    applyDelegationCardRelayEvent(state, 'tool.complete', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\nREADME.md', success: true });
    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-2', name: 'read_file', signature: 'read_file\nREADME.md' });
    applyDelegationCardRelayEvent(state, 'tool.complete', { toolCallId: 'tool-2', name: 'read_file', signature: 'read_file\nREADME.md', success: true });

    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].repeatCount, 2);
    assert.equal(state.items[0].state, 'done');
  });

  it('updates tool completion in place and preserves reasoning expand state', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'tool.start', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\nREADME.md' });
    applyDelegationCardRelayEvent(state, 'assistant.reasoning_delta', { content: 'Need to verify the docs.' });
    applyDelegationCardRelayEvent(state, 'assistant.reasoning', { content: 'Need to verify the docs.' });

    const reasoningItem = state.items.find((item) => item.kind === 'reasoning');
    assert.equal(setDelegationCardReasoningExpanded(state, reasoningItem.id, false), true);

    applyDelegationCardRelayEvent(state, 'tool.complete', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\nREADME.md', success: true });

    assert.deepEqual(state.items.map((item) => item.kind), ['tool', 'reasoning']);
    assert.equal(state.items[0].state, 'done');
    assert.equal(state.items[1].expanded, false);
  });

  it('uses the terminal summary only when no assistant content was streamed', () => {
    const emptyState = createDelegationCardState();
    assert.equal(ensureDelegationCardSummaryContent(emptyState, 'Final delegated answer.'), true);
    assert.equal(hasDelegationCardAssistantContent(emptyState), true);

    const streamedState = createDelegationCardState();
    applyDelegationCardRelayEvent(streamedState, 'assistant.message_delta', { content: 'Partial answer' });
    assert.equal(ensureDelegationCardSummaryContent(streamedState, 'Final delegated answer.'), false);
    assert.equal(streamedState.items.length, 1);
  });

  it('reconciles cumulative assistant deltas without duplicating the same sentence', () => {
    const state = createDelegationCardState();
    const sentence = 'I found the frontend toolchain already; now I\'m checking the native side to confirm the desktop stack.';

    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { content: 'I found the frontend toolchain already; now I\'m ' });
    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { content: sentence });
    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { content: sentence });
    applyDelegationCardRelayEvent(state, 'assistant.message', { content: sentence });

    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].kind, 'assistant');
    assert.equal(state.items[0].content, sentence);
    assert.equal(state.items[0].streaming, false);
  });

  it('reuses the same assistant and reasoning rows across interrupted final events', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'assistant.message_delta', {
      messageId: 'msg-1',
      content: 'I\'m pulling the usage from the repo docs and scripts so the answer matches how this app is meant to be run.',
    });
    applyDelegationCardRelayEvent(state, 'assistant.reasoning_delta', {
      reasoningId: 'reason-1',
      content: 'Reading usage docs',
    });
    applyDelegationCardRelayEvent(state, 'assistant.message', {
      messageId: 'msg-1',
      content: 'I\'m pulling the usage from the repo docs and scripts so the answer matches how this app is meant to be run.',
    });
    applyDelegationCardRelayEvent(state, 'assistant.reasoning', {
      reasoningId: 'reason-1',
      content: 'Reading usage docs',
    });

    assert.deepEqual(state.items.map((item) => item.kind), ['assistant', 'reasoning']);
    assert.equal(state.items[0].streaming, false);
    assert.equal(state.items[1].streaming, false);
  });

  it('uses the terminal summary to finish an incomplete streaming assistant item', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'assistant.message_delta', {
      messageId: 'msg-1',
      content: 'In the app, the intended flow is:\n\n1.',
    });

    assert.equal(reconcileDelegationCardTerminalSummaryContent(state, 'In the app, the intended flow is:\n\n1. Select an agent\n2. Set the working directory\n3. Create a session'), true);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].streaming, false);
    assert.match(state.items[0].content, /Select an agent/);
  });

  it('finalizes any lingering streaming items when the delegation reaches a terminal state', () => {
    const state = createDelegationCardState();

    applyDelegationCardRelayEvent(state, 'assistant.message_delta', { messageId: 'msg-1', content: 'Usage:' });
    applyDelegationCardRelayEvent(state, 'assistant.reasoning_delta', { reasoningId: 'reason-1', content: 'Reading usage docs' });

    assert.equal(finalizeDelegationCardStreamingItems(state), true);
    assert.equal(state.items[0].streaming, false);
    assert.equal(state.items[1].streaming, false);
  });

  it('settles lingering running tool rows when the delegation reaches a terminal state', () => {
    const completedState = createDelegationCardState();

    applyDelegationCardRelayEvent(completedState, 'tool.start', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\nREADME.md' });
    applyDelegationCardRelayEvent(completedState, 'tool.start', { toolCallId: 'tool-2', name: 'read_file', signature: 'read_file\nREADME.md' });
    applyDelegationCardRelayEvent(completedState, 'tool.complete', { toolCallId: 'tool-1', name: 'read_file', signature: 'read_file\nREADME.md', success: true });

    assert.equal(completedState.items[0].state, 'running');
    assert.equal(settleDelegationCardToolItems(completedState, true), true);
    assert.equal(completedState.items[0].state, 'done');

    const failedState = createDelegationCardState();
    applyDelegationCardRelayEvent(failedState, 'tool.start', { toolCallId: 'tool-1', name: 'grep_search', signature: 'grep_search\nrelay' });

    assert.equal(settleDelegationCardToolItems(failedState, false), true);
    assert.equal(failedState.items[0].state, 'failed');
  });

  it('drops immediately repeated finalized assistant content', () => {
    const state = createDelegationCardState();
    const sentence = 'Reading app config';

    applyDelegationCardRelayEvent(state, 'assistant.message', { messageId: 'msg-1', content: sentence });
    applyDelegationCardRelayEvent(state, 'assistant.message', { messageId: 'msg-2', content: sentence });

    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].content, sentence);
  });
});