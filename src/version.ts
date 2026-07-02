import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let cached: string | null = null;

/**
 * Single source of truth for the CLI/server version: package.json, read
 * relative to the compiled dist/ directory. Only for the CLI tree — the
 * library (harness.ts) inlines a literal because bundling consumers may
 * not have fs access to package.json.
 */
export function pkgVersion(): string {
  if (cached !== null) return cached;
  let version = '0.0.0';
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    if (typeof pkg.version === 'string') version = pkg.version;
  } catch {
    // fall through to the default
  }
  cached = version;
  return cached;
}
