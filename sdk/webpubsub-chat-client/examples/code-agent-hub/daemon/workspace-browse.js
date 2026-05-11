/**
 * Workspace browser used by the daemon to answer the web portal's
 * "let me pick a working directory" requests. Pure node:fs + path; no
 * dependency on daemon globals.
 */

import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const WORKSPACE_LIST_LIMIT = 200;

function listWorkspaceFavorites(workspaceRoots = []) {
  return [...new Set((workspaceRoots || []).filter(Boolean).map((path) => resolve(path)))].map((path) => ({
    name: path.split(/[\\/]/).filter(Boolean).pop() || path,
    path,
    kind: 'favorite',
  }));
}

async function listFilesystemRoots(workspaceRoots = []) {
  const favorites = listWorkspaceFavorites(workspaceRoots);
  if (process.platform !== 'win32') {
    return {
      favorites,
      roots: [{ name: '/', path: '/', kind: 'root' }],
    };
  }

  const roots = [];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const drive = `${letter}:\\`;
    try {
      await access(drive);
      roots.push({ name: `${letter}:`, path: drive, kind: 'root' });
    } catch {}
  }
  return { favorites, roots };
}

async function readDirectoryEntries(base, { query = '', limit = WORKSPACE_LIST_LIMIT } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const entries = await readdir(base, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => !normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
    .map((entry) => ({ name: entry.name, path: resolve(base, entry.name), kind: 'directory' }));
  return {
    dirs: dirs.slice(0, limit),
    total: dirs.length,
    truncated: dirs.length > limit,
  };
}

export async function listDirectoriesForPath(inputPath, workspaceRoots = [], options = {}) {
  const home = process.env.HOME || process.cwd();
  const requestedRaw = String(inputPath || '').trim();
  const query = String(options.query || '').trim();
  const limit = Math.max(25, Math.min(Number(options.limit) || WORKSPACE_LIST_LIMIT, WORKSPACE_LIST_LIMIT));

  if (!requestedRaw || requestedRaw === '__roots__') {
    const filter = query.toLowerCase();
    const { favorites, roots } = await listFilesystemRoots(workspaceRoots);
    const match = (entry) => !filter || entry.name.toLowerCase().includes(filter) || entry.path.toLowerCase().includes(filter);
    return {
      mode: 'roots',
      base: '',
      query,
      favorites: favorites.filter(match),
      roots: roots.filter(match),
      dirs: [],
      total: 0,
      truncated: false,
    };
  }

  const requested = requestedRaw.replace(/^~(?=$|[\\/])/, home);
  try {
    const base = resolve(requested);
    const result = await readDirectoryEntries(base, { query, limit });
    return { mode: 'children', base, query, ...result };
  } catch {
    const parent = resolve(requested, '..');
    try {
      const partial = requested.split(/[\\/]/).pop()?.toLowerCase() || '';
      const result = await readDirectoryEntries(parent, { query: query || partial, limit });
      return { mode: 'children', base: parent, partial, query: query || partial, ...result };
    } catch {
      return { mode: 'children', base: resolve(requested), query, dirs: [], total: 0, truncated: false };
    }
  }
}

export async function resolveWorkingDirectoryOrThrow(inputPath) {
  const requested = String(inputPath || '').trim();
  const normalized = resolve(requested || process.cwd());
  try {
    await readdir(normalized, { withFileTypes: true });
    return normalized;
  } catch {
    const shownPath = requested || normalized;
    throw new Error(`Directory not found on this daemon: ${shownPath}`);
  }
}
