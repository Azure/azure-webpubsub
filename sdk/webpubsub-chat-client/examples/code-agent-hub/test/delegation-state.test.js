import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { beginActiveDelegationSettlement } from '../daemon/delegation-state.js';

describe('delegation state helpers', () => {
  it('claims and clears the active delegation before async settlement continues', () => {
    const delegation = { delegationId: 'delegation-1', settled: false, terminalStatus: '' };
    const state = { activeDelegation: delegation };

    const claimed = beginActiveDelegationSettlement(state, 'completed');

    assert.equal(claimed, delegation);
    assert.equal(state.activeDelegation, null);
    assert.equal(delegation.settled, true);
    assert.equal(delegation.terminalStatus, 'completed');
  });

  it('ignores non-terminal and already-settled delegations', () => {
    const activeDelegation = { delegationId: 'delegation-2', settled: false, terminalStatus: '' };
    const activeState = { activeDelegation };

    assert.equal(beginActiveDelegationSettlement(activeState, 'started'), null);
    assert.equal(activeState.activeDelegation, activeDelegation);
    assert.equal(activeDelegation.settled, false);

    const settledDelegation = { delegationId: 'delegation-3', settled: true, terminalStatus: 'completed' };
    const settledState = { activeDelegation: settledDelegation };

    assert.equal(beginActiveDelegationSettlement(settledState, 'completed'), null);
    assert.equal(settledState.activeDelegation, settledDelegation);
  });
});