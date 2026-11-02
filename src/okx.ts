import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface Check { name: string; ok: boolean; detail: string }
export interface CheckReport { endpoint: string; compatible: boolean; live_payment_verified: false; checks: Check[] }
export const DEFAULT_ENDPOINT = 'https://api.nitrograph.com/integrations/okx/mcp';
const EXAMPLES: Record<string, Record<string, unknown>> = {
  company_enrichment: { domain: 'example.com' },
  website_extract: { url: 'https://example.com' },
  web_research: { query: 'Nitrograph API documentation', max_results: 3 },
};

/** Read-only payment negotiation. No wallet, private key, API key, or payment
 * signature is read or sent. A provider returning free data is reported as an
 * incompatible paid listing, never silently upgraded to a purchase. */
export async function checkOkx(endpoint = DEFAULT_ENDPOINT, examples = EXAMPLES,
  options: { allowLocal?: boolean } = {}): Promise<CheckReport> {
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash
    || !(url.protocol === 'https:' || (options.allowLocal && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('Use a public HTTPS endpoint without credentials, query parameters, or fragments');
  }
  const checks: Check[] = [];
  const client = new Client({ name: 'nitrograph-okx-check', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) }),
  });
  try {
    await client.connect(transport);
    checks.push({ name: 'initialize', ok: true, detail: 'MCP handshake succeeded without credentials' });
    const listed = await client.listTools();
    checks.push({ name: 'tools/list', ok: listed.tools.length > 0 && !listed.nextCursor,
      detail: `${listed.tools.length} tools; discovery was free${listed.nextCursor ? '; pagination needs review' : ''}` });
    for (const tool of listed.tools) {
      const metadataOk = Boolean(tool.title?.trim() && tool.description?.trim() && tool.inputSchema?.type === 'object');
      checks.push({ name: `${tool.name}:metadata`, ok: metadataOk, detail: metadataOk ? 'Top-level title, description, and schema present' : 'Missing required marketplace metadata' });
      if (!Object.hasOwn(examples, tool.name)) {
        checks.push({ name: `${tool.name}:price`, ok: false, detail: 'No example inputs supplied; payment challenge not verified' }); continue;
      }
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': transport.protocolVersion ?? '2025-03-26',
          ...(transport.sessionId ? { 'Mcp-Session-Id': transport.sessionId } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'tools/call', params: { name: tool.name, arguments: examples[tool.name] } }),
      });
      const encoded = response.headers.get('payment-required');
      let valid = false;
      let detail = `HTTP ${response.status}; expected 402 with PAYMENT-REQUIRED`;
      if (response.status === 402 && encoded && encoded.length < 24_000) {
        try {
          const challenge = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
          const accepts = challenge.accepts;
          valid = challenge.x402Version === 2 && challenge.resource?.url === endpoint && Array.isArray(accepts) && accepts.length > 0
            && accepts.every((a: any) => a.scheme === 'exact' && a.network === 'eip155:196'
              && typeof a.amount === 'string' && /^[1-9]\d*$/.test(a.amount)
              && /^0x[\da-fA-F]{40}$/.test(a.asset) && /^0x[\da-fA-F]{40}$/.test(a.payTo)
              && !/^0x0{40}$/i.test(a.payTo) && Number.isInteger(a.maxTimeoutSeconds) && a.maxTimeoutSeconds > 0);
          detail = valid ? `Fixed-price x402 challenge on X Layer; ${accepts.length} payment option(s); no payment submitted` : 'Malformed or unsupported x402 challenge';
        } catch { detail = 'PAYMENT-REQUIRED is not valid base64 JSON'; }
      }
      await response.body?.cancel();
      checks.push({ name: `${tool.name}:price`, ok: valid, detail });
    }
  } catch {
    checks.push({ name: 'connection', ok: false, detail: 'MCP connection or price probe failed; check endpoint availability and configuration' });
  } finally { await client.close().catch(() => {}); }
  return { endpoint, compatible: checks.length > 0 && checks.every((c) => c.ok), live_payment_verified: false, checks };
}

export async function runOkxCheck(args: string[]): Promise<void> {
  if (args[0] !== 'okx' || args[1] !== 'check') throw new Error('Usage: nitrograph integrations okx check [--endpoint URL] [--examples FILE] [--json]');
  let endpoint = DEFAULT_ENDPOINT;
  let examples = EXAMPLES;
  let json = false;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--endpoint' && args[i + 1]) endpoint = args[++i];
    else if (args[i] === '--examples' && args[i + 1]) {
      const parsed = JSON.parse(await readFile(args[++i], 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Examples must be an object keyed by tool name');
      examples = parsed;
    } else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  const report = await checkOkx(endpoint, examples);
  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n'
    : report.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`).join('\n')
      + '\nNo payment was submitted. Live payment and marketplace approval remain separate checks.\n');
  if (!report.compatible) process.exitCode = 1;
}
