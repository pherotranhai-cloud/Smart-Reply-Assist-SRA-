#!/usr/bin/env node
/**
 * Increments the patch component of package.json's version.
 *
 * package.json is the single source of truth for the app version: the frontend
 * reads it through the __APP_VERSION__ define in vite.config.ts, and server.ts
 * imports it directly. Nothing else stores a copy, so bumping here is enough.
 *
 * Run automatically by .githooks/pre-commit, or manually via `npm run version:bump`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');

const raw = readFileSync(pkgPath, 'utf-8');
const pkg = JSON.parse(raw);

const parts = String(pkg.version).split('.').map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error(`[bump-version] Cannot parse version "${pkg.version}" — expected major.minor.patch`);
  process.exit(1);
}

const [major, minor, patch] = parts;
const next = `${major}.${minor}.${patch + 1}`;

// Rewrite just the version line so the rest of the file keeps its formatting.
const updated = raw.replace(
  /^(\s*"version"\s*:\s*)"[^"]+"/m,
  (_m, prefix) => `${prefix}"${next}"`
);
if (updated === raw) {
  console.error('[bump-version] Could not find a "version" field to update.');
  process.exit(1);
}

writeFileSync(pkgPath, updated);
console.log(`[bump-version] ${pkg.version} -> ${next}`);
