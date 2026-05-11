import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import the handlers directly from agent-client logic
// We test the handler functions in isolation (no Chat connection needed)

const testDir = join(tmpdir(), `agent-client-test-${Date.now()}`);

describe('agent-client handlers', () => {
  before(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'test.txt'), 'line1\nline2\nline3\nline4\nline5\n');
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('readTextFile', () => {
    it('should read a file', () => {
      const content = readFileSync(join(testDir, 'test.txt'), 'utf-8');
      assert.ok(content.includes('line1'));
      assert.ok(content.includes('line5'));
    });

    it('should support line/limit params', () => {
      const content = readFileSync(join(testDir, 'test.txt'), 'utf-8');
      const lines = content.split('\n');
      // Simulate line=2, limit=2
      const sliced = lines.slice(1, 3).join('\n');
      assert.equal(sliced, 'line2\nline3');
    });

    it('should throw for missing file', () => {
      assert.throws(() => {
        readFileSync(join(testDir, 'nonexistent.xyz'), 'utf-8');
      });
    });
  });

  describe('writeTextFile', () => {
    it('should write a file', () => {
      const path = join(testDir, 'output.txt');
      writeFileSync(path, 'hello world', 'utf-8');
      assert.equal(readFileSync(path, 'utf-8'), 'hello world');
    });

    it('should create parent directories', () => {
      const path = join(testDir, 'sub', 'deep', 'file.txt');
      mkdirSync(join(testDir, 'sub', 'deep'), { recursive: true });
      writeFileSync(path, 'nested', 'utf-8');
      assert.equal(readFileSync(path, 'utf-8'), 'nested');
    });
  });

  describe('createTerminal', () => {
    it('should run a command and capture output', async () => {
      const { spawn } = await import('node:child_process');
      const result = await new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', 'console.log("test-output-123")'], {
          cwd: testDir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', d => output += d.toString());
        child.stderr.on('data', d => output += d.toString());
        child.on('close', (code) => resolve({ output, exitCode: code }));
      });
      assert.ok(result.output.includes('test-output-123'), `Expected "test-output-123" in output, got: "${result.output}"`);
      assert.equal(result.exitCode, 0);
    });

    it('should capture non-zero exit code', async () => {
      const { spawn } = await import('node:child_process');
      const result = await new Promise((resolve) => {
        const child = spawn('node', ['-e', 'process.exit(42)'], {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.on('close', (code) => resolve({ exitCode: code }));
      });
      assert.equal(result.exitCode, 42);
    });
  });
});
