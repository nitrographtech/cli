import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkOkx } from '../src/okx.js';

async function endpoint(options: { missingTitle?: boolean; missingHeader?: boolean; free?: boolean } = {}) {
  const requests: Array<{ method: string; authorization?: string; signature?: string }> = [];
  let base = '';
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const rpc = JSON.parse(body);
    requests.push({ method: rpc.method, authorization: req.headers.authorization, signature: req.headers['payment-signature'] as string });
    res.setHeader('Content-Type', 'application/json');
    if (!Object.hasOwn(rpc, 'id')) { res.writeHead(202).end(); return; }
    let result: unknown;
    if (rpc.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mock', version: '1' } };
    else if (rpc.method === 'tools/list') result = { tools: [{ name: 'company_enrichment',
      ...(options.missingTitle ? {} : { title: 'Company information' }), description: 'Retrieve company information',
      inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } }] };
    else if (rpc.method === 'tools/call') {
      if (options.free) result = { content: [{ type: 'text', text: 'free' }] };
      else {
        const challenge = { x402Version: 2, resource: { url: base }, accepts: [{ scheme: 'exact', network: 'eip155:196',
          amount: '10000', asset: '0x' + '11'.repeat(20), payTo: '0x' + '22'.repeat(20), maxTimeoutSeconds: 300 }] };
        if (!options.missingHeader) res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(challenge)).toString('base64'));
        res.writeHead(402).end(JSON.stringify(challenge)); return;
      }
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
  });
  server.listen(0, '127.0.0.1'); await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as any).port}/mcp`;
  return { base, requests, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test('checker negotiates MCP and prices without sending auth or a payment proof', async () => {
  const f = await endpoint();
  try {
    const report = await checkOkx(f.base, undefined, { allowLocal: true });
    assert.equal(report.compatible, true, JSON.stringify(report));
    assert.equal(report.live_payment_verified, false);
    assert.equal(f.requests.filter((r) => r.method === 'tools/call').length, 1);
    assert.ok(f.requests.every((r) => !r.authorization && !r.signature));
  } finally { await f.close(); }
});
test('missing metadata, missing price header, and free responses fail paid compatibility', async () => {
  for (const opts of [{ missingTitle: true }, { missingHeader: true }, { free: true }]) {
    const f = await endpoint(opts);
    try { assert.equal((await checkOkx(f.base, undefined, { allowLocal: true })).compatible, false); }
    finally { await f.close(); }
  }
});
test('unknown tool examples do not silently count as verified prices', async () => {
  const f = await endpoint();
  try {
    assert.equal((await checkOkx(f.base, {}, { allowLocal: true })).compatible, false);
    assert.equal(f.requests.filter((r) => r.method === 'tools/call').length, 0);
  } finally { await f.close(); }
});
test('public command rejects insecure or credential-bearing endpoints', async () => {
  for (const url of ['http://example.com/mcp', 'https://user:secret@example.com/mcp', 'https://example.com/mcp?api_key=secret']) {
    await assert.rejects(checkOkx(url));
  }
});
