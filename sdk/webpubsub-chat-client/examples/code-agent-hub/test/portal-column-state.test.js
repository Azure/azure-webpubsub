import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDaemonCardsMarkup, sortSessionsForDisplay } from '../web-portal/public/js/portal-column-state.js';

describe('portal column state helpers', () => {
  it('renders daemon OS icons for aliased platforms without requiring caller normalization', () => {
    const html = buildDaemonCardsMarkup({
      daemonEntries: [[
        'daemon-mac',
        {
          daemonId: 'daemon-mac',
          hostname: 'mac-host',
          platform: 'macos',
        },
      ]],
      osIcons: { darwin: '<svg class="os-mac"></svg>' },
      osNames: { darwin: 'macOS' },
      escapeHtml: (value) => String(value),
    });

    assert.match(html, /os-mac/);
    assert.match(html, /macOS/);
    assert.doesNotMatch(html, /🖥/);
  });

  it('renders hidden workspaces in a collapsed section with unhide controls', () => {
    const html = buildDaemonCardsMarkup({
      daemonEntries: [
        ['daemon-alpha', { daemonId: 'daemon-alpha', hostname: 'alpha', platform: 'linux' }],
        ['daemon-beta', { daemonId: 'daemon-beta', hostname: 'beta', platform: 'linux' }],
      ],
      hiddenDaemonIds: new Set(['daemon-beta']),
      escapeHtml: (value) => String(value),
    });

    assert.match(html, /data-action="hide-daemon" data-daemon-id="daemon-alpha"/);
    assert.match(html, /data-action="hide-daemon" data-daemon-id="daemon-alpha">×<\/button>/);
    assert.match(html, /data-action="toggle-hidden-daemons"/);
    assert.match(html, /data-action="unhide-daemon" data-daemon-id="daemon-beta"/);
    assert.match(html, /data-action="unhide-daemon" data-daemon-id="daemon-beta">\+<\/button>/);
    assert.match(html, /Hidden workspaces/);
  });

  it('sorts sessions by name by default and keeps time mode available', () => {
    const sessions = [
      { sessionId: 's2', name: 'Zulu', updatedAt: '2026-04-24T00:00:02.000Z', agent: 'claude' },
      { sessionId: 's1', name: 'Alpha', updatedAt: '2026-04-24T00:00:01.000Z', agent: 'copilot' },
      { sessionId: 's3', name: 'Bravo', updatedAt: '2026-04-24T00:00:03.000Z', agent: 'codex' },
    ];

    assert.deepEqual(
      sortSessionsForDisplay({ sessions }).map((session) => session.sessionId),
      ['s1', 's3', 's2'],
    );
    assert.deepEqual(
      sortSessionsForDisplay({ sessions, mode: 'time' }).map((session) => session.sessionId),
      ['s3', 's2', 's1'],
    );
  });

  it('keeps name sorting stable when a selected session timestamp changes', () => {
    const sessions = [
      { sessionId: 's2', name: 'Repo', updatedAt: '2026-04-24T00:00:02.000Z', agent: 'claude' },
      { sessionId: 's1', name: 'Repo', updatedAt: '2026-04-24T00:00:01.000Z', agent: 'claude' },
    ];

    assert.deepEqual(
      sortSessionsForDisplay({ sessions, mode: 'name' }).map((session) => session.sessionId),
      ['s1', 's2'],
    );

    const afterOpen = [
      { sessionId: 's2', name: 'Repo', updatedAt: '2026-04-24T00:10:00.000Z', agent: 'claude' },
      { sessionId: 's1', name: 'Repo', updatedAt: '2026-04-24T00:00:01.000Z', agent: 'claude' },
    ];

    assert.deepEqual(
      sortSessionsForDisplay({ sessions: afterOpen, mode: 'name' }).map((session) => session.sessionId),
      ['s1', 's2'],
    );
  });
});