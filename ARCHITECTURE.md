# Nitrograph CLI — Architecture Overview

This document is the onboarding map for the `nitrographtech/cli` repo.
It's the `nitrograph` npm package — an install wizard + stdio MCP
server that points agents at `api.nitrograph.com`. Updated
periodically — check `git log ARCHITECTURE.md` for history.

**Last refreshed:** 2026-04-23

---

## 1. What this package is

```
npx nitrograph              → install wizard
npx nitrograph server       → stdio MCP server
```

Two jobs:

1. **Installer** — auto-detects MCP clients (Claude Desktop, Cursor,
   Cline, Zed, Windsurf, Hermes) on the user's machine, writes the
   right config file in the right place, and prompts the user to
   restart each client. Zero config.
2. **Stdio MCP server** — spawned by the client after install. Proxies
   the four Nitrograph tools over stdio → HTTPS calls to
   `api.nitrograph.com`. No local state.

The server command is meant for clients that **don't** support the
hosted streamable-HTTP MCP transport. For anything modern, the user
should skip the CLI entirely and just paste
`https://api.nitrograph.com/mcp` into their client.

Published at `npmjs.com/package/nitrograph`. Latest: see `package.json`.

---

## 2. The four MCP tools

Exposed identically by this CLI and by the hosted `api.nitrograph.com/mcp`.

| Tool | Purpose | API call |
| --- | --- | --- |
| `nitrograph_discover` | Rank services against a natural-language intent | `POST /v1/discover` |
| `nitrograph_service_detail` | Load a service's full integration map (endpoints, gotchas, patterns) | `GET /v1/service/:slug` |
| `nitrograph_report_outcome` | Agent reports whether a call succeeded or failed | `POST /v1/service/:slug/report-outcome` |
| `nitrograph_report_pattern` | Agent reports a working multi-step recipe | `POST /v1/service/:slug/report-pattern` |

Discover results are pre-formatted as markdown by the API server. The
CLI tool description instructs the LLM to output it *verbatim* — no
reorder, no commentary — because the ranking is load-bearing.

---

## 3. Directory tour

```
src/
  index.ts    — Entry point + command dispatch
                  (default → wizard; "server" → MCP)
  install.ts  — The wizard. Detects each client, edits its config
                JSON/YAML, prints next-steps.
  server.ts   — MCP stdio server. Registers the four tools, dispatches
                to api.ts, formats results.
  api.ts      — HTTPS client. Handles 402/429 as PaymentRequired (not
                errors) so the wizard can surface pay-to-continue
                cleanly.
  config.ts   — Reads/writes ~/.config/nitrograph/config.json.
                Stores api_url override (default: api.nitrograph.com).
  banner.ts   — ANSI banner + colored output helpers.

dist/         — Compiled output shipped in the npm tarball.

package.json  — Declares the `nitrograph` bin, engines: node >=18.
```

No tests yet — the CLI is a thin proxy; the interesting logic
(ranking, scoring, synthesis) lives in the api repo.

---

## 4. Install wizard flow (`src/install.ts`)

1. **Print banner** + explain what Nitrograph is.
2. **Detect clients** by checking known config paths
   (`~/.claude.json`, `~/.cursor/mcp.json`, etc).
3. **For each detected client**, write the MCP server entry:
   ```json
   {
     "mcpServers": {
       "nitrograph": {
         "command": "npx",
         "args": ["-y", "nitrograph", "server"]
       }
     }
   }
   ```
   Client-specific quirks (Windsurf uses `serverUrl`, Zed uses
   `context_servers`) handled in `ClientTarget.insert()`.
4. **Print restart instructions** for each modified client.
5. **Save preferences** to `config.json` for idempotency.

---

## 5. Server flow (`src/server.ts`)

Spawned as `nitrograph server` by whatever client added it. Uses
`@modelcontextprotocol/sdk` with `StdioServerTransport`.

1. Registers the four tools with their input schemas.
2. On `CallToolRequest`, dispatches to the matching function in
   `api.ts`.
3. Handles three response shapes:
   - **Success** → forwards the JSON/markdown verbatim as a
     `TextContent`.
   - **PaymentRequired** (402/429) → returns a text block telling the
     agent how to surface the pay-to-continue URL to the user.
   - **ApiError** → returns the error message as an error
     `TextContent`.

The server never mutates the API response. The ordering and formatting
are set server-side so every client looks identical regardless of LLM.

---

## 6. What this CLI does NOT do

- **No auth.** The API is IP-rate-limited; when the free tier is
  exceeded, agents see 402 and surface a pay-to-continue URL.
- **No caching.** Every discover call round-trips to prod. Adding
  TTL caching would hurt the ranker feedback loop.
- **No ranking.** All scoring happens server-side. The CLI forwards.
- **No service-map storage.** Gotchas and patterns live in the prod
  database; the CLI just asks for them.

This means: **updates to the ranker in the api repo take effect
immediately.** The only time this CLI needs a release is when we add
a new MCP tool, change an input schema, or ship an install-wizard
fix for a new client.

---

## 7. Relationship to the api repo

```
nitrograph (this CLI)
       │
       │  stdio MCP
       ▼
Client (Claude Desktop / Cursor / Cline / Zed / Windsurf / Hermes)
       │
       │  npx nitrograph server spawns this
       ▼
src/server.ts → src/api.ts
       │
       │  HTTPS
       ▼
api.nitrograph.com (the api repo)
       │
       │  SQL
       ▼
Railway Postgres (services, reputation_*, payments, gotchas, patterns)
```

For any client that supports remote streamable-HTTP MCP servers, skip
the CLI entirely and register `https://api.nitrograph.com/mcp`
directly. The CLI exists only to bridge clients that are stdio-only.

---

## 8. Release process

1. Bump `version` in `package.json`.
2. `npm run build` (compiles TS → `dist/`).
3. `npm publish`.
4. Update `README.md` if the install surface or tool list changed.
5. Update `ARCHITECTURE.md` (this file) if structure or flow
   changed.

`prepublishOnly` runs the build automatically, so publishing will
fail if TypeScript errors exist.

---

## 9. Non-negotiables

- **Never embed a default API key.** There are none in this codebase
  and it stays that way. The api is designed to be pay-to-continue,
  not key-gated.
- **Tool descriptions are prompt engineering.** The `OUTPUT CONTRACT`
  clauses in `server.ts` discover-tool description prevent LLMs from
  rewriting, reordering, or truncating the ranked list. Don't loosen
  them without reading the api repo's discover compose logic.
- **Keep wizard output terse.** Users who run `npx nitrograph` in a
  terminal are typically in the middle of something. Short messages,
  no dramatic banners (the one we ship is already enough).

---

## 10. Reading order for new contributors

1. `src/index.ts` — how commands dispatch.
2. `src/server.ts` — the four MCP tools and their output contracts.
3. `src/api.ts` — thin HTTPS wrapper, 402/429 handling.
4. `src/install.ts` — client detection + config writing.
5. The api repo's `ARCHITECTURE.md` — because the ranking /
   scoring / payment logic that this package proxies all lives
   there.
