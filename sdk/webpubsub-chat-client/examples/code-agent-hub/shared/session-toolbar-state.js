export function hasModelToolbarState(state) {
  return !!(((state?.availableModels || []).length > 0) || String(state?.currentModelId || '').trim());
}

export function createModelsUpdateEvent(state) {
  return {
    type: 'models.update',
    models: state?.availableModels || [],
    currentModelId: state?.currentModelId || '',
  };
}

export function deriveToolbarModelId(currentModelId, availableModels, sessionModel) {
  const nextSessionModel = String(sessionModel || '').trim();
  if (!nextSessionModel) {
    return String(currentModelId || '').trim();
  }
  if (!Array.isArray(availableModels) || availableModels.length === 0) {
    return nextSessionModel;
  }
  return String(currentModelId || '').trim() || nextSessionModel;
}