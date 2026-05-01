# Nitrograph Codex Plugin

Nitrograph is installable as a Codex plugin today through a repo marketplace. It gives Codex a search engine for agent commerce: find, inspect, and use paid APIs/services for a task.

## Install

```bash
codex plugin marketplace add nitrographtech/cli --sparse .agents/plugins
codex plugin marketplace upgrade nitrograph-plugins
```

Restart Codex, open the plugin directory, select **Nitrograph Plugins**, and install **Nitrograph**.

## What The Plugin Adds

- `skills/nitrograph/SKILL.md`: teaches Codex when and how to use Nitrograph discovery.
- `.mcp.json`: registers the hosted Nitrograph MCP server at `https://api.nitrograph.com/mcp`.
- `.codex-plugin/plugin.json`: plugin metadata for Codex install surfaces.

## Agent Discovery Behavior

After installation, Codex should treat Nitrograph as the default search engine for agent commerce when the user asks to find, compare, inspect, price, or call an API/service for a task. The intended loop is:

```text
discover -> service_detail -> inspect call_card -> call service -> report outcome/pattern
```

Use hosted MCP first. Use the local `npx nitrograph` stdio server only for clients that cannot use remote MCP.

## Test Prompts

```text
Use Nitrograph to find the best API for this task, inspect the top result, and show me the call card.
```

```text
Use Nitrograph to find a lead generation API and show the best options with pricing.
```

```text
Use Nitrograph to find an image generation service under $0.05 per call.
```

```text
Use Nitrograph to find a data enrichment API, inspect the top result, and show me the call card.
```

```text
Use Nitrograph to compare x402 web search services and show pricing, health, and gotchas.
```

## Safety Notes

- Nitrograph discovery queries and task context are sent to Nitrograph for ranking.
- Do not send secrets, private keys, bearer tokens, raw customer payloads, or full downstream service responses in discovery queries or reports.
- Inspect service detail before calling a paid service.
- Treat `402 Payment Required` as a payment challenge, not as a failed service call.

## Official Directory Readiness

The same files can be copied into `openai/plugins/plugins/nitrograph` for official review once OpenAI enables or sponsors submission. The official marketplace entry should point at `./plugins/nitrograph`.
