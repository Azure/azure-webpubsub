import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const replacements = [
  {
    filePath: resolve('node_modules/@github/copilot-sdk/dist/session.js'),
    from: 'from "vscode-jsonrpc/node";',
    to: 'from "vscode-jsonrpc/node.js";',
  },
  {
    filePath: resolve('node_modules/@github/copilot-sdk/dist/session.d.ts'),
    from: 'from "vscode-jsonrpc/node";',
    to: 'from "vscode-jsonrpc/node.js";',
  },
];

let changed = false;

for (const replacement of replacements) {
  if (!existsSync(replacement.filePath)) {
    continue;
  }

  const content = readFileSync(replacement.filePath, 'utf8');
  if (content.includes(replacement.to)) {
    continue;
  }
  if (!content.includes(replacement.from)) {
    throw new Error(`Unexpected @github/copilot-sdk content in ${replacement.filePath}`);
  }

  writeFileSync(replacement.filePath, content.replace(replacement.from, replacement.to), 'utf8');
  changed = true;
}

if (changed) {
  console.log('[postinstall] patched @github/copilot-sdk ESM imports');
}