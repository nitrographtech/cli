import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOOLS } from '../src/server.ts';

// Enforces the shared MCP tool contract on the STDIO surface. The identical
// contract file and test live in the API repo for the hosted surface, so the
// two can't silently drift (the 0.5.10 incident: filters were made optional in
// the CLI but the hosted server still forced them).
const contract = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tool-contract.json'), 'utf8'),
);

const byName = new Map(TOOLS.map((t: any) => [t.name, t]));

test('exposes exactly the contract tool set', () => {
  assert.deepEqual(
    TOOLS.map((t: any) => t.name).slice().sort(),
    contract.tools.map((t: any) => t.name).slice().sort(),
  );
});

for (const spec of contract.tools) {
  test(`${spec.name}: required fields match the contract`, () => {
    const tool: any = byName.get(spec.name);
    assert.ok(tool, `missing tool ${spec.name}`);
    assert.deepEqual(tool.inputSchema.required ?? [], spec.required);
  });

  if (spec.filtersOptional !== undefined) {
    test(`${spec.name}: filters are optional and expose the contract fields`, () => {
      const tool: any = byName.get(spec.name);
      const filters = tool.inputSchema.properties?.filters;
      assert.ok(filters, 'filters property missing');
      assert.ok(
        !(tool.inputSchema.required ?? []).includes('filters'),
        'filters must not be a required property',
      );
      assert.equal(filters.required ?? undefined, undefined, 'filters must not require sub-fields');
      assert.deepEqual(Object.keys(filters.properties ?? {}).slice().sort(), [...spec.filterFields].sort());
    });
  }
}
