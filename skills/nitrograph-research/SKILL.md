---
name: nitrograph-research
description: Paid research and enrichment through Nitrograph with validation and refunds. Use when the user asks to enrich a company or person, research a topic, run a paid web search, or scrape a page — and wants a validated result they are only charged for if it passed. Requires a Nitrograph API key (`NITROGRAPH_API_KEY`).
---

# Nitrograph Research

Validated, pay-per-result research. Every call routes to a **certified**
supplier, the response is validated against the research-enrichment ruleset,
and the account is charged **only if validation passed** — failures are
refunded automatically and carry a signed receipt either way.

## Setup

Requires an API key in `NITROGRAPH_API_KEY` (`ng_live_...`, created at
https://nitrograph.com/login — free starter credits; `NITROGRAPH_API_KEY` (or legacy `NITROGRAPH_SCOPE_TOKEN`)
is a legacy alias, issued from the account
owner's dashboard or `POST /v1/agent-scopes`). Every request below sends it
as `Authorization: Bearer <token>`. If it is missing, tell the user how to
get one; do not fall back to unauthenticated endpoints for paid work.

## Behaviors

All behaviors are one call: `POST https://api.nitrograph.com/v1/invoke` with
an `intent` — the router picks the certified supplier. Do not choose
suppliers by hand and do not name the supplier in your answer; the receipt
records it.

### enrich_company(domain)
```json
{ "intent": "enrich a company from its domain: firmographics, industry, size",
  "query": { "domain": "<domain>" }, "max_price_micro_usd": 250000 }
```

### enrich_person(name, company)
```json
{ "intent": "find verified contact information for a person at a company",
  "query": { "name": "<name>", "company": "<company>" }, "max_price_micro_usd": 250000 }
```

### research(topic)
```json
{ "intent": "web search with fresh results for a research topic",
  "query": { "q": "<topic>" }, "max_price_micro_usd": 100000 }
```

### scrape(url)
```json
{ "intent": "scrape a web page and extract its text content",
  "query": { "url": "<url>" }, "max_price_micro_usd": 100000 }
```

## Rules

1. **Check balance first** when starting a session of paid work:
   `GET /v1/credits/balance`. If a call returns `402` / `insufficient_balance`,
   tell the user to top up at their dashboard (`POST /v1/credits/checkout`
   returns the payment URL) — never treat it as a service failure.
2. **Respect the caps.** `403 scope_cap_exceeded` means the scope's spending
   cap is reached: stop, report how much was spent, ask before continuing.
3. **Read the outcome.** The response carries `state` (`settled` = charged,
   `refunded` = not charged), `charged_micro_usd`, `receipt_id`, and
   `validation`. On `refunded`, say what failed (the `validation.checks`
   with `passed: false`) and offer to retry — retries in the same minute are
   free replays.
4. **Surface the receipt id** with every result so the user can fetch the
   signed evidence at `GET /v1/credits/receipts/:id`.
5. **Never send secrets or customer PII in intents.** Intents are routing
   text. Structured inputs go in `query`.
6. `409 no_certified_supplier_for_intent` means the vertical has no certified
   supplier under the price ceiling — report that honestly rather than
   downgrading to an uncertified one.

## Price discipline

Every behavior sets `max_price_micro_usd` (1_000_000 = $1). Raise it only
when the user explicitly accepts a higher price. Quote refusals return
`402 quote_exceeds_max_price` with the actual quote — relay it and ask.
