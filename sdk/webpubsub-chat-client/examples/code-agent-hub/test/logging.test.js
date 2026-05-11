import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import {
  createLogger,
  getContextLogger,
  resolveLogConfig,
  sanitizeLogFields,
  summarizePathForLog,
  withLogContext,
} from '../shared/logging.js';

function createCaptureStream() {
  const chunks = [];
  const stream = new PassThrough();
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => chunks.push(chunk));
  return {
    stream,
    read() {
      return chunks.join('');
    },
  };
}

function parseJsonLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('logging helpers', () => {
  it('defaults to json logging outside a tty and validates env input', () => {
    assert.deepEqual(
      resolveLogConfig({
        CODEAGENTHUB_LOG_LEVEL: 'verbose',
        CODEAGENTHUB_LOG_FORMAT: 'wat',
      }, { isTTY: false }),
      {
        format: 'json',
        includeContentPreview: false,
        includeStacks: false,
        level: 'info',
      },
    );

    assert.deepEqual(
      resolveLogConfig({
        CODEAGENTHUB_LOG_LEVEL: 'debug',
        CODEAGENTHUB_LOG_FORMAT: 'pretty',
        CODEAGENTHUB_LOG_CONTENT_PREVIEW: 'true',
        CODEAGENTHUB_LOG_INCLUDE_STACKS: '1',
      }, { isTTY: false }),
      {
        format: 'pretty',
        includeContentPreview: true,
        includeStacks: true,
        level: 'debug',
      },
    );
  });

  it('redacts sensitive fields while keeping useful metadata', () => {
    const sanitized = sanitizeLogFields({
      prompt: 'explain the bug in detail',
      accessToken: 'secret-token',
      error: new Error('boom'),
      workingDirectory: 'G:\\repo\\examples\\code-agent-hub',
    }, {
      format: 'json',
      includeContentPreview: false,
      includeStacks: false,
      level: 'info',
    });

    assert.deepEqual(sanitized.prompt, { redacted: true, length: 25 });
    assert.deepEqual(sanitized.accessToken, { redacted: true, length: 12 });
    assert.equal(sanitized.error.message, 'boom');
    assert.equal(sanitized.workingDirectory, 'examples/code-agent-hub');
  });

  it('captures child bindings and async request context in structured output', async () => {
    const capture = createCaptureStream();
    const logger = createLogger({ component: 'test' }, {
      env: {
        CODEAGENTHUB_LOG_FORMAT: 'json',
        CODEAGENTHUB_LOG_LEVEL: 'debug',
      },
      isTTY: false,
      stream: capture.stream,
    });

    await withLogContext({ requestId: 'req-123' }, async () => {
      getContextLogger(logger)
        .child({ area: 'unit' })
        .info('logging.context.propagated', { daemonId: 'daemon-1' }, 'Context propagated');
    });

    await new Promise((resolve) => setImmediate(resolve));

    const [entry] = parseJsonLines(capture.read());
    assert.equal(entry.service, 'codeagenthub');
    assert.equal(entry.component, 'test');
    assert.equal(entry.area, 'unit');
    assert.equal(entry.requestId, 'req-123');
    assert.equal(entry.daemonId, 'daemon-1');
    assert.equal(entry.event, 'logging.context.propagated');
    assert.equal(entry.message, 'Context propagated');
  });

  it('renders pretty logs as a single human-readable line', async () => {
    const capture = createCaptureStream();
    const logger = createLogger({ component: 'test' }, {
      env: {
        CODEAGENTHUB_LOG_FORMAT: 'pretty',
        CODEAGENTHUB_LOG_LEVEL: 'info',
      },
      isTTY: true,
      stream: capture.stream,
    });

    logger.info('logging.pretty.rendered', { daemonId: 'daemon-1' }, 'Pretty output');

    await new Promise((resolve) => setImmediate(resolve));

    const lines = String(capture.read())
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    assert.equal(lines.length, 1);
    assert.match(lines[0], /Pretty output/);
    assert.match(lines[0], /daemon-1/);
    assert.equal(lines[0].includes('"level":"info"'), false);
  });

  it('keeps daemon and portal server entrypoints free of direct console logging', async () => {
    const [daemonSource, portalSource] = await Promise.all([
      readFile(new URL('../daemon/agent-daemon.js', import.meta.url), 'utf8'),
      readFile(new URL('../web-portal/web-server.js', import.meta.url), 'utf8'),
    ]);

    const consoleCallPattern = /\bconsole\.(?:log|warn|error|info|debug)\s*\(/;
    assert.equal(consoleCallPattern.test(daemonSource), false);
    assert.equal(consoleCallPattern.test(portalSource), false);
  });

  it('routes browser warnings through the shared portalWarn helper', async () => {
    const appSource = await readFile(new URL('../web-portal/public/js/app.js', import.meta.url), 'utf8');
    const consoleCalls = appSource.match(/\bconsole\.(?:log|warn|error|info|debug)\s*\(/g) || [];

    assert.match(appSource, /function portalWarn\(/);
    assert.equal(consoleCalls.length, 1);
  });

  it('summarizes filesystem paths for logs', () => {
    assert.equal(summarizePathForLog('G:\\repo\\examples\\code-agent-hub'), 'examples/code-agent-hub');
    assert.equal(summarizePathForLog('/workspace/code-agent-hub'), 'workspace/code-agent-hub');
    assert.equal(summarizePathForLog('README.md'), 'README.md');
  });
});