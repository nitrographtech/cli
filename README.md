# Nitrograph

[![npm version](https://img.shields.io/npm/v/nitrograph.svg)](https://www.npmjs.com/package/nitrograph)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-111827)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-111827.svg)](LICENSE)

Find the right API for an agent. Inspect how to call it. Report whether it worked.

Nitrograph is a service discovery network for agent-usable APIs, including x402 and MPP services. It ranks services by task relevance, health, trust, cost, and prior agent outcomes, then exposes the result through MCP, a TypeScript harness, and raw HTTP.

```bash
npm i nitrograph
```

## Quick Start

### Option 1: With an AI agent

Install the Nitrograph skill, then ask your agent to find a service:

```bash
npx skills add nitrographtech/cli
```

Example prompts:

> Using the Nitrograph skill, find a lead generation API, inspect the best result, and tell me how to call it.

> Use Nitrograph to find an image generation service. Show recommended results separately from related lower-confidence matches.

> Find a data enrichment service, call service detail for the top result, and report the outcome after invocation.

The skill teaches agents the Nitrograph workflow: discover first, treat `results` as high-confidence recommendations, treat `related_results` as semantic fallbacks, call service detail before invocation, and report outcomes afterward.

### Option 2: Hosted MCP

Register Nitrograph as a remote MCP server:

```text
https://api.nitrograph.com/mcp
```

No npm install, subprocess, or API key required. Use this when your MCP client supports remote HTTP servers.

### Option 3: Local MCP

```bash
npx nitrograph
```

The wizard detects installed MCP clients and writes a stdio server entry into each config file, creating `.bak` backups first. If stdin is not a TTY, it runs hands-off and installs into every detected client.

### Option 4: TypeScript Harness

```ts
import { Nitrograph } from 'nitrograph';

const ng = new Nitrograph();

const { results, related_results } = await ng.discover('lead generation', {
  limit: 10,
});

const best = results[0];
const detail = await ng.serviceDetail(best.slug);

await ng.reportOutcome({
  slug: best.slug,
  success: true,
  endpoint: '/v1/people/search',
  latencyMs: 350,
});
```

## Why Nitrograph?

- Agent-first discovery: natural-language service search, not keyword docs browsing.
- High-confidence ranking: primary `results` are separated from lower-confidence `related_results`.
- Call readiness: service detail returns endpoints, schemas, health, costs, gotchas, and proven patterns.
- Feedback loop: agents report success/failure, and future rankings learn from outcomes.
- Multi-surface: one network exposed through hosted MCP, local MCP, TypeScript, and raw HTTP.

## MCP Tools

| Tool | Purpose |
|---|---|
| `nitrograph_discover` | Search by natural-language task. Returns recommended `results` and lower-confidence `related_results`. |
| `nitrograph_service_detail` | Fetch endpoints, schemas, costs, health, gotchas, and proven patterns for a service. |
| `nitrograph_report_outcome` | Record success/failure after a service call. Feeds trust and gotcha promotion. |
| `nitrograph_report_pattern` | Record a successful reusable multi-step workflow. |

## Harness API

```ts
new Nitrograph({
  apiUrl: 'https://api.nitrograph.com',
  sessionToken: process.env.NITROGRAPH_SESSION_TOKEN,
  timeoutMs: 15_000,
  userAgent: 'my-agent/1.0',
});
```

Errors extend `NitrographError`:

- `NitrographApiError`: non-2xx response.
- `NitrographPaymentRequiredError`: free tier exhausted; includes `payAt`.
- `NitrographNetworkError`: timeout or connection failure.

## Raw HTTP

```bash
curl -sX POST https://api.nitrograph.com/v1/discover \
  -H 'content-type: application/json' \
  -d '{"query":"lead generation","limit":10}'
```

```bash
curl -s https://api.nitrograph.com/v1/service/apollo
```

## Skills

Nitrograph ships an agent skill at:

```text
skills/nitrograph/SKILL.md
```

Install from GitHub:

```bash
npx skills add nitrographtech/cli
```

For Codex plugin-style installs, sparse-install the skill surface:

```bash
codex plugin marketplace add nitrographtech/cli --sparse skills
```

## Config

`~/.config/nitrograph/config.json`:

```json
{
  "api_url": "https://api.nitrograph.com"
}
```

The free tier requires no config. When the free tier is exhausted, Nitrograph returns a pay-to-continue URL; the returned session token can be passed as `NITROGRAPH_SESSION_TOKEN`.

## Links

- Website: <https://nitrograph.com>
- Docs: <https://nitrograph.com/docs>
- Agent docs: <https://nitrograph.com/llms-full.txt>
- npm: <https://www.npmjs.com/package/nitrograph>
- Issues: <https://github.com/nitrographtech/cli/issues>

## License

MIT
