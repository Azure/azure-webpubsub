#!/usr/bin/env node
/**
 * Regenerates the `blobs` section of upstream.json from the upstream repository.
 *
 * This is the only part of the fork tooling that needs network access, and it is
 * meant to be run by a human when deliberately moving to a new upstream commit.
 * CI never runs this script -- see verify-upstream.js, which is fully offline.
 *
 * Usage:
 *   node scripts/update-upstream-manifest.js                     # clone upstream into a temp dir
 *   node scripts/update-upstream-manifest.js --from <clone-path> # reuse an existing clone
 *   node scripts/update-upstream-manifest.js --commit <sha>      # move the pin to a new commit
 *
 * The `divergence` section is intentionally preserved: it is hand-maintained
 * documentation of what Azure changed and why.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(TOOL_DIR, "upstream.json");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") out.from = argv[++i];
    else if (argv[i] === "--commit") out.commit = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const { repository, subtree } = manifest.upstream;
  const commit = args.commit || manifest.upstream.commit;

  let clone = args.from;
  if (!clone) {
    clone = fs.mkdtempSync(path.join(os.tmpdir(), "sio-admin-upstream-"));
    console.log(`Cloning ${repository} into ${clone} ...`);
    git(["clone", "--quiet", repository, clone]);
  }

  // Resolve to a full SHA so the pin is unambiguous.
  const fullSha = git(["rev-parse", `${commit}^{commit}`], clone).trim();

  const entries = git(
    ["ls-tree", "-r", fullSha, "--format=%(objectname) %(path)", "--", `${subtree}/`],
    clone
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf(" ");
      return { sha: line.slice(0, sep), path: line.slice(sep + 1) };
    });

  const prefix = `${subtree}/`;
  const blobs = {};
  for (const { sha, path: p } of entries.sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!p.startsWith(prefix)) continue;
    blobs[p.slice(prefix.length)] = sha;
  }

  manifest.upstream.commit = fullSha;
  manifest.blobs = blobs;

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Pinned ${repository}@${fullSha.slice(0, 7)} (${subtree}/)`);
  console.log(`Recorded ${Object.keys(blobs).length} upstream files in upstream.json`);
  console.log("\nNow run: node scripts/verify-upstream.js");
  console.log("and update the `divergence` section for anything it reports as undeclared.");
}

main();
