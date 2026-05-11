/**
 * Persistent session store backing `~/.copilot-mobile/sessions.json`.
 *
 * Thin debounced JSON-file wrapper. The daemon owns its own runtime
 * `Map<sessionId, SessionState>`; this module only persists the small
 * subset we need to resume sessions across restarts (agentName, acpSessionId,
 * cwd, supportsResume, delegationContextEntries…).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DEFAULT_SESSION_STORE_PATH = process.env.SESSION_STORE_PATH
  || resolve(process.env.HOME || process.env.USERPROFILE || '.', '.copilot-mobile', 'sessions.json');

const DEFAULT_DEBOUNCE_MS = 150;

export function createSessionStore({
  filePath = DEFAULT_SESSION_STORE_PATH,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  logger,
} = {}) {
  const records = {};
  let dirty = false;
  let saveTimer = null;
  let savePromise = Promise.resolve();

  async function writeToDisk() {
    if (!dirty) return;
    dirty = false;
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err) {
      logger?.warn?.('session-store.save.failed', { filePath, error: err }, 'Failed to save session store');
    }
  }

  function schedule(immediate = false) {
    dirty = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    if (!immediate) {
      saveTimer = setTimeout(() => {
        saveTimer = null;
        savePromise = savePromise.then(writeToDisk, writeToDisk);
      }, debounceMs);
      saveTimer.unref?.();
      return savePromise;
    }

    savePromise = savePromise.then(writeToDisk, writeToDisk);
    return savePromise;
  }

  return {
    /** Read the on-disk store and merge it into the in-memory record map. */
    async load() {
      try {
        const data = JSON.parse(await readFile(filePath, 'utf-8'));
        if (data && typeof data === 'object') Object.assign(records, data);
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          logger?.warn?.('session-store.load.failed', { filePath, error: err }, 'Failed to load session store');
        }
      }
      return records;
    },
    get: (roomId) => records[roomId],
    has: (roomId) => Boolean(records[roomId]),
    persist(roomId, record) {
      records[roomId] = record;
      schedule();
    },
    update(roomId, patch) {
      if (!records[roomId]) return;
      records[roomId] = { ...records[roomId], ...patch };
      schedule();
    },
    delete(roomId) {
      if (!records[roomId]) return;
      delete records[roomId];
      schedule();
    },
    /** Force any pending debounced write to disk. */
    flush: () => schedule(true),
  };
}
