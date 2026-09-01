import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authenticate } from '../src/login.ts';
import { TOOLS } from '../src/server.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('nitrograph_authenticate', { concurrency: 1 }, () => {
test('authenticate schema matches hosted (api_key + device_token optional)', () => {
  const tool = TOOLS.find((t) => t.name === 'nitrograph_authenticate') as any;
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.required ?? [], []);
  assert.deepEqual(
    Object.keys(tool.inputSchema.properties ?? {}).slice().sort(),
    ['api_key', 'device_token'],
  );
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test('authenticate with no args starts device pairing', async () => {
  const orig = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return jsonResponse({
      user_code: 'ABCD-1234',
      verification_url: 'https://nitrograph.com/pair',
      device_token: 'devtok',
      poll_interval_seconds: 5,
      expires_in_seconds: 900,
    });
  }) as typeof fetch;
  try {
    const result = await authenticate({});
    assert.equal((result as any).device_token, 'devtok');
    assert.equal((result as any).user_code, 'ABCD-1234');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1\/auth\/device\/start$/);
    assert.equal((calls[0].body as any).label, 'nitrograph-mcp');
  } finally {
    globalThis.fetch = orig;
  }
});

test('authenticate with device_token polls and stores the claimed key', async () => {
  const origFetch = globalThis.fetch;
  const origXdg = process.env.XDG_CONFIG_HOME;
  const dir = mkdtempSync(join(tmpdir(), 'ng-auth-'));
  process.env.XDG_CONFIG_HOME = dir;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.match(String(input), /\/v1\/auth\/device\/poll$/);
    return jsonResponse({ status: 'approved', api_key: 'ng_live_paired' });
  }) as typeof fetch;

  try {
    const result = await authenticate({ device_token: 'devtok' });
    assert.equal((result as any).status, 'approved');
    assert.equal((result as any).api_key, 'ng_live_paired');
    assert.ok((result as any).stored_in);
    const stored = JSON.parse(readFileSync((result as any).stored_in, 'utf8'));
    assert.equal(stored.apiKey, 'ng_live_paired');
  } finally {
    globalThis.fetch = origFetch;
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  }
});

test('authenticate with api_key verifies and stores a valid key', async () => {
  const origFetch = globalThis.fetch;
  const origXdg = process.env.XDG_CONFIG_HOME;
  const dir = mkdtempSync(join(tmpdir(), 'ng-auth-'));
  process.env.XDG_CONFIG_HOME = dir;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v1\/session$/);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer ng_live_valid');
    return jsonResponse({ authenticated: true, plan: 'paid', queries_remaining: 100 });
  }) as typeof fetch;

  try {
    const result = await authenticate({ api_key: 'ng_live_valid' });
    assert.equal((result as any).authenticated, true);
    assert.equal((result as any).plan, 'paid');
    const stored = JSON.parse(readFileSync((result as any).stored_in, 'utf8'));
    assert.equal(stored.apiKey, 'ng_live_valid');
  } finally {
    globalThis.fetch = origFetch;
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  }
});

test('authenticate with api_key does not store an invalid key', async () => {
  const origFetch = globalThis.fetch;
  const origXdg = process.env.XDG_CONFIG_HOME;
  const dir = mkdtempSync(join(tmpdir(), 'ng-auth-'));
  process.env.XDG_CONFIG_HOME = dir;

  globalThis.fetch = (async () => {
    return jsonResponse({
      authenticated: false,
      plan: 'free',
      valid: false,
      reason: 'invalid_or_expired_token',
    });
  }) as typeof fetch;

  try {
    const result = await authenticate({ api_key: 'ng_live_fake' });
    assert.equal((result as any).valid, false);
    assert.equal((result as any).stored_in, undefined);
  } finally {
    globalThis.fetch = origFetch;
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
  }
});
});
