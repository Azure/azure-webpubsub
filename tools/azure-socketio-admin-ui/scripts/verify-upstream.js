#!/usr/bin/env node
/**
 * Verifies this fork against its recorded upstream baseline.
 *
 * This directory vendors https://github.com/socketio/socket.io-admin-ui. Most of
 * the tree is meant to stay byte-identical to upstream; only a declared set of
 * files carries Azure-specific changes. This script proves that is still true.
 *
 * It is fully offline: upstream.json records upstream's Git blob SHAs, and a Git
 * blob SHA is just a content hash, so it can be recomputed locally. No network
 * access, no upstream clone and no Git binary are required.
 *
 * Exit code 0 means reality matches the declaration in upstream.json.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(TOOL_DIR, "upstream.json");

/** Directories that are build output or dependencies, never part of the comparison. */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Caches and local overrides that are never committed. */
const SKIP_FILES = new Set([".eslintcache", ".env.local", ".DS_Store"]);

/**
 * Recomputes the Git blob SHA of a file.
 *
 * Git stores text blobs with LF endings, so the CRLF normalization that `git
 * hash-object` applies has to be replicated here for the hash to match on a
 * Windows checkout with core.autocrlf enabled.
 */
function gitBlobSha(filePath) {
  let buf = fs.readFileSync(filePath);
  const probe = buf.subarray(0, 8000);
  const isBinary = probe.includes(0);
  if (!isBinary && buf.includes(0x0d)) {
    buf = Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  }
  const header = Buffer.from(`blob ${buf.length}\0`, "latin1");
  return crypto.createHash("sha1").update(Buffer.concat([header, buf])).digest("hex");
}

/**
 * Lists the files that make up this tool.
 *
 * Tracked files are the right unit of comparison: scratch files and build caches
 * a developer happens to have lying around are not part of the fork. Git is used
 * when it is available, with a filesystem walk as a fallback so the check still
 * works when building from an exported archive.
 */
function listFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--", "."], {
      cwd: TOOL_DIR,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return walk(TOOL_DIR);
  }
}

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      if (!SKIP_FILES.has(entry.name)) out.push(rel);
    }
  }
  return out;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const { repository, commit, subtree } = manifest.upstream;
  const blobs = manifest.blobs;
  const declared = manifest.divergence;

  const ours = new Set(listFiles());

  const actual = { identical: [], modified: [], added: [], removed: [] };

  for (const [rel, upstreamSha] of Object.entries(blobs)) {
    if (!ours.has(rel)) {
      actual.removed.push(rel);
      continue;
    }
    const sha = gitBlobSha(path.join(TOOL_DIR, rel));
    (sha === upstreamSha ? actual.identical : actual.modified).push(rel);
  }
  for (const rel of ours) {
    if (!(rel in blobs)) actual.added.push(rel);
  }

  const problems = [];
  const check = (kind, list, hint) => {
    for (const rel of list.sort()) {
      if (!(rel in declared[kind])) problems.push({ kind, rel, hint });
    }
  };
  check("modified", actual.modified, "differs from upstream but is not declared as an Azure change");
  check("added", actual.added, "does not exist upstream but is not declared as an Azure addition");
  check("removed", actual.removed, "exists upstream but is not declared as deliberately dropped");

  for (const kind of ["modified", "added", "removed"]) {
    for (const rel of Object.keys(declared[kind]).sort()) {
      if (!actual[kind].includes(rel)) {
        problems.push({
          kind,
          rel,
          hint: `is declared as "${kind}" but no longer is -- the declaration is stale`,
        });
      }
    }
  }

  const short = commit.slice(0, 7);
  console.log(`Upstream: ${repository}@${short} (${subtree}/)`);
  console.log(
    `  ${actual.identical.length} identical, ${actual.modified.length} modified, ` +
      `${actual.added.length} added, ${actual.removed.length} removed`
  );

  if (problems.length === 0) {
    console.log("\nFork matches its declared divergence from upstream.");
    return;
  }

  console.error(`\n${problems.length} undeclared difference(s) from upstream:\n`);
  for (const { kind, rel, hint } of problems) {
    console.error(`  [${kind}] ${rel}\n      ${hint}`);
  }
  console.error(
    "\nEither revert the file so it matches upstream again, or record it in the\n" +
      '"divergence" section of upstream.json with a short reason for the change.\n' +
      "If you are moving to a new upstream commit, run:\n" +
      "  node scripts/update-upstream-manifest.js --commit <sha>"
  );
  process.exit(1);
}

main();
