import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDelegationControlEnvelope,
  buildDelegationRelayEnvelope,
  buildDelegationRelayRoomId,
  buildDelegationSummaryEnvelope,
  buildDelegationTargetControlEnvelope,
  controlTypeForTerminalStatus,
  isDelegationTerminalStatus,
  parseDelegationControlEnvelope,
  parseDelegationRelayEnvelope,
  parseDelegationSummaryEnvelope,
  parseDelegationTargetControlEnvelope,
  summaryTypeForTerminalStatus,
  terminalStatusForRelayStreamType,
} from '../shared/session-delegation.js';

describe('session delegation helpers', () => {
  it('builds stable relay room ids and terminal mappings', () => {
    assert.equal(buildDelegationRelayRoomId(' delegation-123 '), 'delegation-relay-delegation-123');
    assert.equal(buildDelegationRelayRoomId(''), '');

    assert.equal(isDelegationTerminalStatus('completed'), true);
    assert.equal(isDelegationTerminalStatus('expired'), true);
    assert.equal(isDelegationTerminalStatus('started'), false);

    assert.equal(summaryTypeForTerminalStatus('completed'), 'delegation.completed');
    assert.equal(summaryTypeForTerminalStatus('cancelled'), 'delegation.cancelled');
    assert.equal(controlTypeForTerminalStatus('failed'), 'control.delegation.failed');
    assert.equal(controlTypeForTerminalStatus('started'), '');

    assert.equal(terminalStatusForRelayStreamType('terminal.completed'), 'completed');
    assert.equal(terminalStatusForRelayStreamType('terminal.cancelled'), 'cancelled');
    assert.equal(terminalStatusForRelayStreamType('assistant.message_delta'), '');
  });

  it('round-trips summary envelopes and normalizes summary usage', () => {
    const parsed = parseDelegationSummaryEnvelope(JSON.stringify(buildDelegationSummaryEnvelope({
      type: 'delegation.completed',
      delegationId: 'delegation-1',
      relayRoomId: 'delegation-relay-delegation-1',
      sourceSessionId: 'source-1',
      targetSessionId: 'target-1',
      targetLabel: 'Target Session @ daemon-a',
      message: 'done',
      summary: {
        finalContent: 'final answer',
        model: 'gpt-5.4',
        usage: { used: '42', size: '100', ignored: 'x' },
      },
      createdAt: '2026-04-12T00:00:00.000Z',
    })));

    assert.deepEqual(parsed, {
      type: 'delegation.completed',
      delegationId: 'delegation-1',
      relayRoomId: 'delegation-relay-delegation-1',
      sourceSessionId: 'source-1',
      targetSessionId: 'target-1',
      targetLabel: 'Target Session @ daemon-a',
      message: 'done',
      summary: {
        finalContent: 'final answer',
        model: 'gpt-5.4',
        usage: { used: 42, size: 100 },
      },
      createdAt: '2026-04-12T00:00:00.000Z',
    });
  });

  it('round-trips control and target control envelopes', () => {
    const control = parseDelegationControlEnvelope(JSON.stringify(buildDelegationControlEnvelope({
      type: 'control.delegation.started',
      delegationId: 'delegation-2',
      sourceSessionId: 'source-2',
      targetSessionId: 'target-2',
      relayRoomId: 'delegation-relay-delegation-2',
      requesterUserId: 'alice',
      targetDaemonId: 'daemon-b',
      createdAt: '2026-04-12T00:00:01.000Z',
      data: { prompt: 'inspect repo' },
    })));

    assert.equal(control?.type, 'control.delegation.started');
    assert.equal(control?.targetDaemonId, 'daemon-b');
    assert.deepEqual(control?.data, { prompt: 'inspect repo' });

    const targetControl = parseDelegationTargetControlEnvelope(JSON.stringify(buildDelegationTargetControlEnvelope({
      type: 'control.delegation.request',
      delegationId: 'delegation-2',
      sourceSessionId: 'source-2',
      targetSessionId: 'target-2',
      relayRoomId: 'delegation-relay-delegation-2',
      requesterUserId: 'alice',
      targetDaemonId: 'daemon-b',
      createdAt: '2026-04-12T00:00:01.000Z',
      prompt: 'inspect repo',
      displayText: '@target inspect repo',
      resumeFromSeq: '7',
    })));

    assert.equal(targetControl?.type, 'control.delegation.request');
    assert.equal(targetControl?.resumeFromSeq, 7);
    assert.equal(targetControl?.displayText, '@target inspect repo');

    assert.equal(parseDelegationControlEnvelope(JSON.stringify({
      type: 'control.delegation.started',
      delegationId: 'delegation-2',
      sourceSessionId: 'source-2',
      targetSessionId: 'target-2',
    })), null);
    assert.equal(parseDelegationTargetControlEnvelope(JSON.stringify({
      type: 'control.delegation.request',
      delegationId: 'delegation-2',
      targetSessionId: 'target-2',
    })), null);
  });

  it('accepts only well-formed relay envelopes', () => {
    const parsed = parseDelegationRelayEnvelope(JSON.stringify(buildDelegationRelayEnvelope({
      delegationId: 'delegation-3',
      relayRoomId: 'delegation-relay-delegation-3',
      seq: 3,
      sourceSessionId: 'source-3',
      targetSessionId: 'target-3',
      targetDaemonId: 'daemon-c',
      streamType: 'assistant.message_delta',
      payload: { content: 'hello' },
      sentAt: '2026-04-12T00:00:02.000Z',
    })));

    assert.deepEqual(parsed, {
      type: 'delegation.stream.event',
      delegationId: 'delegation-3',
      relayRoomId: 'delegation-relay-delegation-3',
      seq: 3,
      sourceSessionId: 'source-3',
      targetSessionId: 'target-3',
      targetDaemonId: 'daemon-c',
      streamType: 'assistant.message_delta',
      payload: { content: 'hello' },
      sentAt: '2026-04-12T00:00:02.000Z',
    });

    assert.equal(parseDelegationRelayEnvelope(JSON.stringify({
      type: 'delegation.stream.event',
      delegationId: 'delegation-3',
      relayRoomId: 'delegation-relay-delegation-3',
      seq: 0,
      targetSessionId: 'target-3',
      targetDaemonId: 'daemon-c',
      streamType: 'assistant.message_delta',
    })), null);
  });
});