/*
 * Audits handwritten code assets for a leading, language-appropriate documentation comment.
 * Generated output, dependencies, generated declarations, and machine-managed assets are excluded;
 * this check verifies header presence only, leaving semantic quality to review.
 */

import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mode = process.argv[2] ?? "--check";

if (!["--check", "--report"].includes(mode) || process.argv.length > 3) {
  console.error("Usage: node scripts/check-file-headers.mjs [--check|--report]");
  process.exit(2);
}

const eligibleExtensions = new Set([".ts", ".tsx", ".mjs", ".css", ".html"]);
const excludedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  "generated",
  "__generated__",
  "playwright-report",
  "test-results",
]);

function extensionOf(path) {
  for (const extension of eligibleExtensions) {
    if (path.endsWith(extension)) return extension;
  }
  return undefined;
}

function isGeneratedDeclaration(path) {
  const name = path.split(sep).at(-1) ?? "";
  return name === "next-env.d.ts" || /(?:^|\.)gen(?:erated)?\.(?:ts|tsx)$/.test(name);
}

async function collectEligibleFiles(directory, files = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name) && !entry.name.startsWith(".next-")) {
        await collectEligibleFiles(resolve(directory, entry.name), files);
      }
      continue;
    }

    const path = resolve(directory, entry.name);
    if (entry.isFile() && extensionOf(path) && !isGeneratedDeclaration(path)) files.push(path);
  }
  return files;
}

function hasHeader(path, source) {
  const extension = extensionOf(path);
  let start = source.replace(/^\uFEFF/, "").trimStart();
  if (extension === ".mjs" && start.startsWith("#!")) {
    start = start.slice(start.indexOf("\n") + 1).trimStart();
  }
  if (extension === ".css") return start.startsWith("/*");
  if (extension === ".html") return start.startsWith("<!--");
  return start.startsWith("//") || start.startsWith("/*");
}

const eligibleFiles = (await collectEligibleFiles(root)).sort();
const missing = [];

for (const path of eligibleFiles) {
  if (!hasHeader(path, await readFile(path, "utf8"))) missing.push(relative(root, path));
}

console.log(`Header audit: ${eligibleFiles.length} eligible file(s), ${missing.length} missing header(s).`);
for (const path of missing) console.log(`  ${path}`);

if (mode === "--report") {
  console.log("Report mode: no files changed and missing headers do not fail the command.");
} else if (missing.length > 0) {
  process.exitCode = 1;
}
