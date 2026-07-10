// Guard against LIB_VERSION drift.
//
// harness.ts inlines the package version as a literal (LIB_VERSION) because
// library consumers may bundle without fs access to package.json. That literal
// must be updated on every version bump; this check fails the build/publish if
// it wasn't, so the harness never reports a stale version in its user-agent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const harness = readFileSync(join(root, 'src', 'harness.ts'), 'utf8');

const match = harness.match(/const LIB_VERSION = '([^']+)'/);
if (!match) {
  console.error('check-lib-version: could not find LIB_VERSION literal in src/harness.ts');
  process.exit(1);
}

if (match[1] !== pkgVersion) {
  console.error(
    `check-lib-version: LIB_VERSION ('${match[1]}') != package.json version ('${pkgVersion}').\n` +
    `Update LIB_VERSION in src/harness.ts to '${pkgVersion}'.`,
  );
  process.exit(1);
}

console.log(`check-lib-version: ok (${pkgVersion})`);
