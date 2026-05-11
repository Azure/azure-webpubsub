import { isDelegationTerminalStatus } from '../shared/session-delegation.js';

export function beginActiveDelegationSettlement(state, status) {
  const delegation = state?.activeDelegation;
  if (!delegation || !isDelegationTerminalStatus(status) || delegation.settled) {
    return null;
  }

  delegation.settled = true;
  delegation.terminalStatus = status;

  if (state?.activeDelegation === delegation) {
    state.activeDelegation = null;
  }

  return delegation;
}