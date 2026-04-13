export async function finishAcpPromptTurn(state, roomId, {
  shouldFinalize = () => true,
  flushBufferedContent,
  flushCompletedToolInvocations,
  botSend,
  emitSessionState,
  emitIdle = true,
}) {
  if (!state || !shouldFinalize()) return;

  await flushBufferedContent(state, roomId);
  if (!shouldFinalize()) return;

  flushCompletedToolInvocations(roomId);
  if (!shouldFinalize()) return;

  state.isProcessing = false;
  state.isStopping = false;
  state.pendingCount = 0;

  if (emitIdle) {
    await botSend(roomId, { type: 'session.idle' });
    if (!shouldFinalize()) return;
  }

  await emitSessionState(roomId);
}