import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCreateAgentListMarkup,
  buildCreateSessionAgentOptions,
  buildCreateSessionDraft,
} from '../web-portal/public/js/create-session-state.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDir, '..');

function renderEmptyState({ title, detail, icon }) {
  return `<empty title="${title}" detail="${detail}" icon="${icon}"></empty>`;
}

describe('create session state helpers', () => {
  it('hides the managed SDK group for sdk-only daemons while preserving sdk defaults', () => {
    const daemon = {
      daemonId: 'daemon-sdk',
      agents: ['copilot-sdk'],
      platform: 'linux',
      workspaces: ['/workspace/sdk'],
    };

    const html = buildCreateAgentListMarkup({
      daemon,
      selectedAgentName: 'copilot-sdk',
      hasCreatableDaemonEntry: true,
      buildAgentOptions: (currentDaemon) => buildCreateSessionAgentOptions(currentDaemon, {
        agentIcons: { copilot: '<svg></svg>' },
        agentColors: { copilot: '#6baaff' },
      }),
      renderEmptyState,
      escapeHtml: (value) => String(value),
    });

    assert.equal(html, '');
  });

  it('renders only the ACP group in create-session markup when sdk agents are present', () => {
    const daemon = {
      daemonId: 'daemon-mixed',
      agents: ['claude', 'copilot-sdk'],
      platform: 'linux',
      workspaces: ['/workspace/mixed'],
    };

    const html = buildCreateAgentListMarkup({
      daemon,
      selectedAgentName: 'claude',
      hasCreatableDaemonEntry: true,
      buildAgentOptions: (currentDaemon) => buildCreateSessionAgentOptions(currentDaemon, {
        testedAgents: new Set(['claude']),
        agentNames: { claude: 'Claude Code' },
        agentIcons: { claude: '<svg class="claude"></svg>', copilot: '<svg class="copilot"></svg>' },
        agentColors: { claude: '#d97757', copilot: '#6baaff' },
      }),
      renderEmptyState,
      escapeHtml: (value) => String(value),
    });

    assert.match(html, /ACP Compatible/);
    assert.match(html, /Claude Code/);
    assert.doesNotMatch(html, /Managed by SDK/);
    assert.doesNotMatch(html, /GitHub Copilot SDK/);
  });

  it('keeps copilot-sdk as the default selected agent for sdk-only daemons', () => {
    const daemon = {
      daemonId: 'daemon-sdk',
      agents: ['copilot-sdk'],
      platform: 'linux',
      workspaces: ['/workspace/sdk'],
    };

    const draft = buildCreateSessionDraft({
      draft: { daemonId: 'daemon-sdk', agentName: '', directory: '' },
      daemonEntries: [['daemon-sdk', daemon]],
      currentDaemonId: 'daemon-sdk',
      getDaemonById: () => daemon,
      isCreateSelectableDaemon: () => true,
      buildAgentOptions: (currentDaemon) => buildCreateSessionAgentOptions(currentDaemon, {
        agentIcons: { copilot: '<svg></svg>' },
        agentColors: { copilot: '#6baaff' },
      }),
    });

    assert.equal(draft.daemonId, 'daemon-sdk');
    assert.equal(draft.agentName, 'copilot-sdk');
    assert.equal(draft.directory, '/workspace/sdk');
  });

  it('renders a static tool section under workspace in the create-session modal', () => {
    const html = readFileSync(join(projectRoot, 'web-portal', 'public', 'index.html'), 'utf-8');

    assert.match(html, /<div class="csm-column">[\s\S]*?<div class="csm-section-title">Workspace<\/div>[\s\S]*?<div class="csm-section-title">Tool<\/div>/);
    assert.match(html, /<div class="csm-column">[\s\S]*?<div class="csm-section-title">Agent<\/div>[\s\S]*?<div class="csm-section-title">Directory<\/div>/);
    assert.match(html, /<div class="csm-section-title">Workspace<\/div>[\s\S]*?<div class="csm-section-title">Tool<\/div>/);
    assert.match(html, /class="create-tool-input" type="radio" name="create-session-tool" value="cross-agent-call" checked/);
    assert.match(html, /<span class="create-tool-name">Cross-Agent Call<\/span>/);
    assert.match(html, /<div class="dir-input-row"><span class="dir-field-badge" id="f-dir-badge" aria-hidden="true"><\/span><div class="dir-input-wrap">/);
    assert.match(html, /<input id="f-dir" class="dir-input"[^>]*aria-label="Project path"/);
    assert.doesNotMatch(html, /Project Path/);
    assert.doesNotMatch(html, /select-create-tool/);
  });

  it('keeps the managed SDK group commented out instead of deleting the code', () => {
    const source = readFileSync(join(projectRoot, 'web-portal', 'public', 'js', 'create-session-state.js'), 'utf-8');

    assert.match(source, /\/\/ renderGroup\('Managed by SDK', sdkOptions\),/);
  });

  it('styles the ACP Compatible title as a centered divider label', () => {
    const css = readFileSync(join(projectRoot, 'web-portal', 'public', 'styles.css'), 'utf-8');

    assert.match(css, /\.create-agent-group-title\{display:flex;align-items:center;justify-content:center;gap:10px;font-size:9px;/);
    assert.match(css, /\.create-agent-group-title::before,\.create-agent-group-title::after\{content:'';flex:1;min-width:18px;height:1px;background:color-mix\(in srgb,var\(--fg7\) 58%,transparent\)\}/);
  });

  it('renders the directory OS badge to the left of the path input', () => {
    const css = readFileSync(join(projectRoot, 'web-portal', 'public', 'styles.css'), 'utf-8');

    assert.match(css, /\.dir-input-row\{display:flex;align-items:flex-start;gap:10px\}/);
    assert.match(css, /\.dir-field-badge\{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:40px;height:40px;/);
  });
});