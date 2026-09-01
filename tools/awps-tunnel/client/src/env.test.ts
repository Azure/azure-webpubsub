import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Vite inlines `import.meta.env.VITE_*` at build time. A name that is never
// defined silently becomes `undefined` instead of failing the build, so a typo
// or a missed migration only shows up as a broken request at runtime. These
// tests turn that class of mistake into a test failure.

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (sourceExtensions.has(path.extname(entry.name)) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const sourceFiles = collectSourceFiles(srcDir);

test("the scan actually sees the application sources", () => {
  expect(sourceFiles.length).toBeGreaterThan(10);
});

test("every VITE_ variable the app reads is defined", () => {
  const referencedIn = new Map<string, string[]>();
  for (const file of sourceFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = match[1];
      if (!name.startsWith("VITE_")) continue;
      const files = referencedIn.get(name) ?? [];
      files.push(path.relative(srcDir, file));
      referencedIn.set(name, files);
    }
  }

  const undefinedVars = [...referencedIn]
    .filter(([name]) => import.meta.env[name] === undefined)
    .map(([name, files]) => `${name} (read by ${[...new Set(files)].join(", ")})`);

  expect(undefinedVars).toEqual([]);
});

test("no source file reads process.env", () => {
  // Vite does not define `process` in the browser bundle. Anything left over
  // from the react-scripts era evaluates to undefined rather than erroring.
  const offenders = sourceFiles
    .filter((file) => /process\.env\b/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(srcDir, file));

  expect(offenders).toEqual([]);
});
