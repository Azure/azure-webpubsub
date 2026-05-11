const MIN_DELEGATION_RELAY_HISTORY_COUNT = 1;
const MAX_DELEGATION_RELAY_HISTORY_COUNT = 100;

export function clampDelegationRelayHistoryMaxCount(maxCount) {
  const numericMaxCount = Number(maxCount);
  if (!Number.isFinite(numericMaxCount)) {
    return MAX_DELEGATION_RELAY_HISTORY_COUNT;
  }

  return Math.min(
    MAX_DELEGATION_RELAY_HISTORY_COUNT,
    Math.max(MIN_DELEGATION_RELAY_HISTORY_COUNT, Math.trunc(numericMaxCount)),
  );
}

export function createDelegationRelayConnectionPromise(connect, {
  onError,
  onFinally,
} = {}) {
  if (typeof connect !== 'function') {
    throw new TypeError('connect must be a function');
  }

  return Promise.resolve()
    .then(() => connect())
    .catch((error) => {
      if (typeof onError === 'function') {
        onError(error);
      }
    })
    .finally(() => {
      if (typeof onFinally === 'function') {
        onFinally();
      }
    });
}