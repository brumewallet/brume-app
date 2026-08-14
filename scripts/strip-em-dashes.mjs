#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const BRUME_ROOT = path.resolve(import.meta.dirname, "../../..");
const BRUME_APP = path.resolve(import.meta.dirname, "..");

const TARGETS = [
  BRUME_APP,
  path.join(BRUME_ROOT, "skills"),
  path.join(BRUME_ROOT, "awesome-ux-skills"),
  path.join(BRUME_ROOT, "memory"),
  path.join(BRUME_ROOT, "APP/brume-protocol"),
  path.join(BRUME_ROOT, "OceanVault-WaveTek"),
  BRUME_ROOT,
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".expo",
  "dist",
  "build",
  "generated",
  ".pnpm-store",
  "loyal-app",
  "APP/brume-protocol",
]);

const EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".md",
  ".css",
  ".json",
  ".txt",
  ".example",
  ".cursorrules",
  ".gitignore",
]);

const SKIP_FILES = new Set(["solana.tokenlist.json"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (dir === BRUME_ROOT && !["APP", "skills"].includes(ent.name) && ent.name.startsWith(".")) {
        continue;
      }
      walk(p, files);
    } else {
      const ext = path.extname(ent.name);
      if ((EXT.has(ext) || ent.name === "AGENTS.md" || ent.name === "CLAUDE.md") && !SKIP_FILES.has(ent.name)) {
        files.push(p);
      }
    }
  }
  return files;
}

let changed = 0;
let replaced = 0;

for (const base of TARGETS) {
  const files =
    base === BRUME_ROOT
      ? [
          ...["SKILL.md", "AGENTS.md", "CONCEPT.md", "DESIGN-COUNCIL.md", "CLAUDE.md"].map((f) =>
            path.join(BRUME_ROOT, f),
          ),
        ].filter((f) => fs.existsSync(f))
      : walk(base);

  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    if (!before.includes("\u2014")) continue;
    const count = (before.match(/\u2014/g) ?? []).length;
    const after = before.replace(/\u2014/g, "-");
    fs.writeFileSync(file, after);
    changed++;
    replaced += count;
  }
}

console.log(`updated ${changed} files, replaced ${replaced} em dashes`);
