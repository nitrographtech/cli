# nitrograph

CLI + MCP server for the [Nitrograph](https://nitrograph.com) service discovery network.

Nitrograph indexes agent-usable APIs with trust scores, payment rails, and health checks. This package gives any MCP client (Claude Desktop, Cursor, Windsurf, Claude Code, Hermes, etc.) four tools for finding, calling, and contributing feedback on those services.

## Install

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
