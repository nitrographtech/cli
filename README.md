# nitrograph

CLI + MCP server for the [Nitrograph](https://nitrograph.com) service discovery network.

Nitrograph indexes agent-usable APIs with trust scores, payment rails, and health checks. This package gives any MCP client (Claude Desktop, Cursor, Windsurf, Claude Code, Hermes) four tools for finding and using those services.

## Install

Two paths — pick whichever your client supports:

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

## Tools

| Tool | Purpose |
|---|---|
| `nitrograph_discover` | Search the registry by natural-language query, with filters for rail, cost, category. Returns a ranked, pre-formatted list. |
| `nitrograph_service_detail` | Fetch endpoints, OpenAPI spec, cost, base URL, and health for a service slug. |
| `nitrograph_report_outcome` | Record success/failure of a call. Feeds the trust score; failure diagnoses are auto-promoted to gotchas after a few agents agree. |
| `nitrograph_report_pattern` | Record a successful multi-step workflow. Auto-promoted to a proven_pattern visible on service_detail after several independent successes. |

## Running the server directly

```bash
npx nitrograph server
```

Uses stdio transport. For use behind an MCP client, not for direct invocation.

## Config

`~/.config/nitrograph/config.json`:

```json
{
  "api_url": "https://api.nitrograph.com",
  "wallet": {
    "address": "0x…",
    "network": "base"
  },
  "auto_pay": {
    "enabled": false,
    "max_usdc_per_purchase": 0.1,
    "max_usdc_per_day": 1.0
  }
}
```

The free tier (50 queries/hour/IP) requires no config. Wallet + auto-pay are reserved for future versions that negotiate x402 payments automatically.

## License

MIT
