#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGES = ["mobile", "wallet", "shared", "app"];
const SKIP_DIRS = new Set(["node_modules", ".expo", ".next", "generated", "dist", "build", "__tests__"]);
const EXT = new Set([".ts", ".tsx", ".js", ".css"]);
const SKIP_FILES = new Set(["expo-env.d.ts", "nativewind-env.d.ts", "next-env.d.ts", "vite-env.d.ts", "test/fileMock.js"]);

const KEEP = [
  /eslint-disable/i,
  /@ts-(ignore|expect-error|nocheck)/,
  /\b(TODO|FIXME|HACK|XXX)\b/,
  /DEV_TEE/i,
  /PBKDF2/i,
  /spoof/i,
  /BRIDGE_MESSAGE/i,
  /must not|never expose|never store|do not commit|do not log|IMPORTANT|WARNING/i,
  /security boundary|DISCLOSURE/i,
  /disclosure.*implementation/i,
  /HttpOnly|SecureStore|keyring worker/i,
  /color-mix|react-native-css|Hermes|inlineRem|rpc-websockets|@noble/i,
  /mainnet rotation/i,
  /integrity failure|PER failure/i,
  /offset \d+|byte \d+|indices \d/i,
  /not a user secret/i,
];

function shouldKeep(text) {
  const t = text.replace(/^\s*\*?\s?/, "").trim();
  if (!t || /^[-=*#_]{3,}$/.test(t)) return false;
  return KEEP.some((re) => re.test(t));
}

function isRemovableBlock(body) {
  const lines = body
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((l) => !shouldKeep(l));
}

function cleanContent(src) {
  let out = src.replace(/\/\*\*?[\s\S]*?\*\//g, (block) => {
    if (shouldKeep(block)) return block;
    const inner = block.replace(/^\/\*\*?/, "").replace(/\*\/$/, "");
    if (isRemovableBlock(inner)) return "";
    return block;
  });

  const lines = out.split("\n");
  const cleaned = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("//")) {
      cleaned.push(line);
      continue;
    }

    const body = trimmed.slice(2).trim();
    if (shouldKeep(body)) {
      cleaned.push(line);
      continue;
    }

    if (
      !body ||
      /^[-=*#_]{3,}$/.test(body) ||
      /^[a-z0-9_.-]+\.(ts|tsx|js|css)$/i.test(body) ||
      /port(ed|ing)?\s+(from|1:1)|mirror(s|ing|ed)?|extension[- ]aligned|parity with|wallet\/src\/|popup\/pages|shadcn|loyal-app/i.test(
        body,
      ) ||
      /^(Types|Helpers|Constants|Exports|Layout|Motion|Theme|Light|Dark)\b/i.test(body) ||
      /^(High-level|Multi-step|Brume-styled|The Brume|Mounted once|Full-screen|Chrome|Toolbar|Press-scale|Glass card|Stagger)/i.test(
        body,
      ) ||
      /design system|semantic color|Load-bearing state|Prevent Android|values mirror/i.test(body) ||
      (/^[A-Z]/.test(body) && body.length > 40) ||
      body.length > 80
    ) {
      continue;
    }

    cleaned.push(line);
  }

  out = cleaned.join("\n").replace(/\n{3,}/g, "\n\n");
  if (!src.endsWith("\n") && out.endsWith("\n")) out = out.slice(0, -1);
  return out;
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (EXT.has(path.extname(ent.name)) && !SKIP_FILES.has(ent.name)) files.push(p);
  }
  return files;
}

let changed = 0;
for (const pkg of PACKAGES) {
  const pkgDir = path.join(ROOT, pkg);
  if (!fs.existsSync(pkgDir)) continue;
  for (const file of walk(pkgDir)) {
    const before = fs.readFileSync(file, "utf8");
    const after = cleanContent(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed++;
    }
  }
}

console.log(`cleaned ${changed} files`);
