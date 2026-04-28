---
name: nitrograph
description: Use Nitrograph when an agent needs to discover, inspect, or evaluate APIs and agent-payable services. Applies to service discovery, MCP tools, the Nitrograph TypeScript harness, raw HTTP API use, x402/MPP services, and reporting service outcomes.
---

# Nitrograph

Nitrograph is a discovery layer for agent-usable services. Use it when you need to find an API/service for a task, compare service fit, inspect invocation details, or report whether a service call worked.

## Preferred Surfaces

1. Use hosted MCP if the client supports remote MCP: `https://api.nitrograph.com/mcp`.
2. Use local MCP when stdio is required: `npx nitrograph`.
3. Use the TypeScript harness in Node projects: `import { Nitrograph } from 'nitrograph'`.
4. Use raw HTTP for non-Node runtimes.

## Workflow

1. Discover services with a natural-language query.
2. Treat `results` as recommended/high-confidence matches.
3. Treat `related_results` as lower-confidence semantic fallbacks, not primary recommendations.
4. Call service detail before invoking a discovered service.
5. After invocation, report outcome with success/failure, latency, endpoint, and a concise diagnosis on failure.
6. Report successful multi-step workflows as patterns when they are reusable.

## TypeScript Harness

```ts
import { Nitrograph } from 'nitrograph';

const ng = new Nitrograph();
const { results, related_results } = await ng.discover('lead generation', { limit: 10 });

const service = results[0];
const detail = await ng.serviceDetail(service.slug);
```

## Raw HTTP

```bash
curl -sX POST https://api.nitrograph.com/v1/discover \
  -H 'content-type: application/json' \
  -d '{"query":"lead generation","limit":10}'
```

## Rules

- Do not invent endpoints from discover results. Use service detail first.
- Do not reorder results; Nitrograph ranking is authoritative.
- Do not present `related_results` as recommended services.
- Prefer the shown `display_slug` for humans, but use `slug` for stable programmatic calls.
- When a call fails, report the actual root cause. Do not report generic "API failed" diagnoses.

## Docs

Full agent docs: https://nitrograph.com/llms-full.txt
