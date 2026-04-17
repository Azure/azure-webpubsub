import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDir, '..');

function getCssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

describe('delegation markdown rendering', () => {
  it('keeps pre-wrap only on streaming delegation content', () => {
    const css = readFileSync(join(projectRoot, 'web-portal', 'public', 'styles.css'), 'utf-8');

    assert.equal(getCssRule(css, '.deleg-msg').includes('white-space:pre-wrap'), false);
    assert.equal(getCssRule(css, '.deleg-msg.streaming').includes('white-space:pre-wrap'), true);
    assert.equal(getCssRule(css, '.deleg-reasoning-body').includes('white-space:pre-wrap'), false);
    assert.equal(getCssRule(css, '.deleg-reasoning-body.streaming').includes('white-space:pre-wrap'), true);
  });

  it('marks delegation reasoning bodies as streaming only while the relay is still streaming', () => {
    const appSource = readFileSync(join(projectRoot, 'web-portal', 'public', 'js', 'app.js'), 'utf-8');

    assert.match(appSource, /reasoningBody\.className=`deleg-reasoning-body\$\{item\.streaming\?' streaming':''\}`/);
  });
});