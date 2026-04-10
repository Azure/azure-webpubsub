import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createModelsUpdateEvent,
  deriveToolbarModelId,
  hasModelToolbarState,
} from '../public/session-toolbar-state.js';

describe('session toolbar state helpers', () => {
  it('treats a current model without a model list as syncable state', () => {
    assert.equal(hasModelToolbarState({ availableModels: [], currentModelId: 'gpt-5.4' }), true);
    assert.equal(hasModelToolbarState({ availableModels: [], currentModelId: '' }), false);
  });

  it('builds a models.update payload even when only the current model is known', () => {
    assert.deepEqual(
      createModelsUpdateEvent({ availableModels: [], currentModelId: 'gpt-5.4' }),
      { type: 'models.update', models: [], currentModelId: 'gpt-5.4' },
    );
  });

  it('falls back to session.state model when the toolbar has no model list yet', () => {
    assert.equal(deriveToolbarModelId('', [], 'gpt-5.4'), 'gpt-5.4');
    assert.equal(deriveToolbarModelId('gpt-4.1', [], 'gpt-5.4'), 'gpt-5.4');
  });

  it('keeps the richer models.update selection when model options are already loaded', () => {
    assert.equal(
      deriveToolbarModelId('gpt-5.4', [{ modelId: 'gpt-5.4' }, { modelId: 'gpt-4.1' }], 'gpt-4.1'),
      'gpt-5.4',
    );
  });
});