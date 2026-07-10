import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscoverArgs } from '../src/server.ts';
import { normalizeJsonBody } from '../src/api.ts';

const ok = (r: any) => {
  assert.ok(!('error' in r), `expected ok, got error: ${r.error}`);
  return r.value;
};
const err = (r: any) => {
  assert.ok('error' in r, 'expected an error result');
  return r.error as string;
};

test('filters are optional: omitted entirely', () => {
  assert.equal(ok(normalizeDiscoverArgs({ query: 'x' })).filters, undefined);
});

test('empty filters object is accepted and dropped', () => {
  assert.equal(ok(normalizeDiscoverArgs({ query: 'x', filters: {} })).filters, undefined);
});

test('legacy all-"any" filters are accepted and collapse to omitted', () => {
  const v = ok(normalizeDiscoverArgs({
    query: 'x',
    filters: { rail: 'any', max_cost: 'any', min_trust: 'any', category: 'any' },
  }));
  assert.equal(v.filters, undefined);
});

test('a single real filter is kept', () => {
  assert.deepEqual(ok(normalizeDiscoverArgs({ query: 'x', filters: { rail: 'x402' } })).filters, { rail: 'x402' });
  assert.deepEqual(ok(normalizeDiscoverArgs({ query: 'x', filters: { max_cost: 1.5 } })).filters, { max_cost: 1.5 });
  assert.deepEqual(ok(normalizeDiscoverArgs({ query: 'x', filters: { min_trust: 80 } })).filters, { min_trust: 80 });
});

test('max_cost: 0 is rejected (free-only is not "no filter")', () => {
  assert.match(err(normalizeDiscoverArgs({ query: 'x', filters: { max_cost: 0 } })), /max_cost/);
});

test('root-level filter keys are rejected with guidance', () => {
  assert.match(err(normalizeDiscoverArgs({ query: 'x', rail: 'x402' })), /root-level/);
});

test('unknown filter keys are rejected', () => {
  assert.match(err(normalizeDiscoverArgs({ query: 'x', filters: { foo: 1 } })), /unsupported discover filter/);
});

test('empty-string filter values are rejected', () => {
  assert.match(err(normalizeDiscoverArgs({ query: 'x', filters: { rail: '' } })), /non-empty/);
});

test('normalizeJsonBody parses a JSON string body once (double-encode guard)', () => {
  assert.deepEqual(normalizeJsonBody('{"a":1}'), { a: 1 });
  assert.deepEqual(normalizeJsonBody('[1,2]'), [1, 2]);
});

test('normalizeJsonBody leaves real objects and plain text untouched', () => {
  assert.deepEqual(normalizeJsonBody({ a: 1 }), { a: 1 });
  assert.equal(normalizeJsonBody('hello world'), 'hello world');
});

test('normalizeJsonBody does not parse when body_type is non-json', () => {
  assert.equal(normalizeJsonBody('{"a":1}', 'text'), '{"a":1}');
});
