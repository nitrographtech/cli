# nitrograph

Agent harness + CLI + MCP server for the [Nitrograph](https://nitrograph.com) service discovery network.

Nitrograph indexes agent-usable APIs with trust scores, payment rails, and health checks. This package gives you three ways to reach it:

- **Library (`import { Nitrograph } from 'nitrograph'`)** — typed harness for embedding discovery + outcome reporting directly in agent code.
- **MCP tools** — four tools (`nitrograph_discover`, `nitrograph_service_detail`, `nitrograph_report_outcome`, `nitrograph_report_pattern`) for any MCP client (Claude Desktop, Cursor, Windsurf, Claude Code, Hermes, etc.).
- **CLI** (`npx nitrograph`) — install wizard that wires the MCP server into every detected client.

## Agent harness (library)

```bash
npm i nitrograph
```

```ts
import { Nitrograph, NitrographPaymentRequiredError } from 'nitrograph';

const ng = new Nitrograph();

// Discover — ranked list
const { results } = await ng.discover('lead generation', { limit: 10, rail: 'x402' });

// Service detail — endpoints, OpenAPI, gotchas, reliability
const detail = await ng.serviceDetail(results[0].slug);

// Report outcome of a call — feeds the trust_boost loop
await ng.reportOutcome({
  slug: 'apollo',
  success: true,
  endpoint: '/v1/people/search',
  latencyMs: 350,
});

// Report a successful multi-step workflow — auto-promoted to a proven_pattern
await ng.reportPattern({
  slug: 'apollo',
  task: 'Find CROs at 50–200 employee SaaS companies',
  steps: [{ step: 1, endpoint: '/v1/people/search', note: 'filter by title + size' }],
  success: true,
});
```

**Options:**

```ts
new Nitrograph({
  apiUrl: 'https://api.nitrograph.com',            // default
  sessionToken: process.env.NITROGRAPH_SESSION_TOKEN,// paid tier (from /v1/pay-to-continue)
  timeoutMs: 15_000,
  userAgent: 'my-agent/1.0',
});
```

**Errors:**

```ts
try {
  await ng.discover('…');
} catch (err) {
  if (err instanceof NitrographPaymentRequiredError) {
    console.log('free tier exhausted · pay at', err.payAt);
  }
}
```

All errors extend `NitrographError`. Concrete classes: `NitrographApiError` (non-2xx), `NitrographPaymentRequiredError` (402/429), `NitrographNetworkError` (connection/timeout).

This release (v0.5.0) ships the discovery primitives. Auto-pay for downstream service invocations lands in a follow-up.

## MCP install

Two paths — pick whichever your client supports.

### Hosted MCP (recommended — zero install)

Register this URL as an MCP server in your client:

```
https://api.nitrograph.com/mcp
```

Transport: streamable HTTP, stateless. No npm, no subprocess, no API key. Works in any MCP client that supports remote HTTP servers.

### Local CLI (stdio transport)

```bash
npx nitrograph
```

The wizard detects installed MCP clients and writes a stdio server entry into each config file (creating a `.bak` of any existing file first). Restart the client to pick up the new tools. Use this path if your client only supports stdio MCP.

**Agent-friendly:** if `stdin` is not a TTY (running inside an agent's Bash tool, a pipe, or CI), the wizard skips all prompts and auto-installs into every detected client. Fully hands-off.

## Tools

| Tool | Purpose |
|---|---|
| `nitrograph_discover` | Search the registry by natural-language query, with filters for rail, cost, category. Returns a ranked, pre-formatted list. |
| `nitrograph_service_detail` | Fetch endpoints, OpenAPI spec, cost, base URL, and health for a service slug. |
| `nitrograph_report_outcome` | Record success/failure of a call. Feeds the trust score; repeated failure diagnoses are auto-promoted to gotchas visible on service detail. |
| `nitrograph_report_pattern` | Record a working multi-step workflow. After several independent successes with the same shape it's auto-promoted to a `proven_pattern`. |

## Running the server directly

```bash
npx nitrograph server
```

Uses stdio transport. For use behind an MCP client, not for direct invocation.

## Try it without installing

```bash
curl -sX POST https://api.nitrograph.com/v1/discover \
  -H 'content-type: application/json' \
  -d '{"query":"text-to-speech with SSML support"}'
```

## Config

`~/.config/nitrograph/config.json`:

```json
{
  "api_url": "https://api.nitrograph.com"
}
```

Only `api_url` is read today. The free tier (50 queries/hour/IP) requires no config. When free tier is exhausted, the CLI surfaces a pay-to-continue URL — pay with x402 USDC on Base and the returned session token carries the balance automatically.

## Links

- Docs: <https://nitrograph.com/docs>
- Source: <https://github.com/nitrographtech/cli>
- Issues: <https://github.com/nitrographtech/cli/issues>

## License

MIT
