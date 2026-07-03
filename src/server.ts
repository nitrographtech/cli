import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  discover,
  serviceDetail,
  invokeService,
  reportOutcome,
  reportPattern,
  isPaymentRequired,
  isApiError,
} from './api.js';
import { pkgVersion } from './version.js';

const TOOLS = [
  {
    name: 'nitrograph_discover',
    description:
      'Use this when an agent needs a search engine for agent commerce: find, search, compare, select, or price an API/service for a task, including x402, MPP, paid APIs, agent tools, data enrichment, lead generation, image generation, search, scraping, and other callable services. Search the Nitrograph registry of agent-usable services. IMPORTANT: always send a complete filters object on every call. Use "any" for each unset filter; do not omit nested filter fields to clear them because some MCP hosts retain omitted fields from previous calls. Do not send filters: {}. Do not send rail: "" or category: "". Do not send max_cost: 0 for "no cost filter"; max_cost: 0 will be rejected. Returns recommended high-confidence results separately from related lower-confidence semantic fallbacks. The returned markdown display is ready to present to the user as-is; its ranking order is authoritative (best match first) — do not re-rank, and do not promote related_results into primary recommendations. Every row includes a slug/display handle for follow-up service_detail calls, cost, health/reliability signals, ranking score, match_reason, and match_strength. To follow up on a specific service, extract its slug or shown handle and call nitrograph_service_detail.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of the capability needed (e.g. "text-to-speech with SSML support").',
        },
        limit: { type: 'number', description: 'Max results (1–50). Default 10.' },
        filters: {
          type: 'object',
          description: 'Complete discover filter state. Send this object every time. Use "any" for no filter; do not omit fields to clear them.',
          additionalProperties: false,
          properties: {
            rail: {
              type: 'string',
              minLength: 1,
              description: 'Payment rail filter: x402, mpp, stripe, none, or "any" for no rail filter.',
            },
            max_cost: {
              anyOf: [
                { type: 'number', exclusiveMinimum: 0 },
                { type: 'string', enum: ['any'] },
              ],
              description: 'Max cost per call in USD. Use "any" for no price filter; do not send 0.',
            },
            min_trust: {
              anyOf: [
                { type: 'number', minimum: 0 },
                { type: 'string', enum: ['any'] },
              ],
              description: 'Minimum trust score. Use "any" for no trust filter.',
            },
            category: {
              type: 'string',
              minLength: 1,
              description: 'Service category filter. Use "any" for no category filter.',
            },
          },
          required: ['rail', 'max_cost', 'min_trust', 'category'],
        },
      },
      required: ['query', 'filters'],
    },
  },
  {
    name: 'nitrograph_service_detail',
    description:
      'Use this after nitrograph_discover whenever the user wants to inspect, compare deeply, implement against, or call a selected API/service. Fetch full detail for a selected service by slug. Include task when you know the user task so call_card can rank routes and return ranked route_cards plus a recommended_endpoint. Returns a call_card: the agent-readable invocation plan with endpoint options, route_cards, gotcha_card, request schemas, cost/payment handling, 402 interpretation, proven patterns, and outcome-reporting policy. Use route_cards and gotcha_card as the primary guide for invoking; OpenAPI remains the schema source of truth.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Service slug as returned by nitrograph_discover.' },
        task: { type: 'string', description: 'Optional original user task/query. Include it so Nitrograph can rank endpoint options for this selection.' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'nitrograph_invoke_service',
    description:
      'Invoke a selected service through Nitrograph using its stored call recipe. Nitrograph automatically captures status, latency, endpoint, payment state, and network error class as outcome metadata; no separate nitrograph_report_outcome call is needed. A 402 payment challenge is returned to the caller and treated as neutral, not as a service failure. Do not send long-lived provider secrets through hosted MCP; for secret-authenticated providers, instrument direct calls locally and use nitrograph_report_outcome after the provider runs.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Service slug as returned by nitrograph_discover.' },
        endpoint_index: { type: 'number', description: 'Optional endpoint option index from service_detail.endpoints. Defaults to the primary call recipe.' },
        query: {
          type: 'object',
          description: 'Optional query parameters to merge into the stored call recipe.',
          additionalProperties: true,
        },
        body: {
          anyOf: [
            { type: 'object', additionalProperties: true },
            { type: 'array' },
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
          ],
          description: 'Optional request body to send instead of the stored example body. Pass JSON as a real object or array, not a JSON-encoded string; a string containing JSON is parsed before forwarding.',
        },
        body_type: {
          type: 'string',
          enum: ['json', 'form-data', 'text'],
          description: 'Optional body encoding. Defaults to the stored recipe body type.',
        },
        headers: {
          type: 'object',
          description: 'Optional per-call headers. Hop-by-hop headers are stripped.',
          additionalProperties: { type: 'string' },
        },
        timeout_ms: { type: 'number', description: 'Optional provider call timeout in milliseconds, max 60000.' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'nitrograph_report_outcome',
    description:
      'Optionally report the outcome of a direct paid/service call after it actually ran. Skip this when the call was made through nitrograph_invoke_service because Nitrograph captures outcome metadata automatically. Do NOT report 402 Payment Required, payment challenge, insufficient balance, or missing payment as a service failure; surface payment instructions to the user and wait until payment is complete. Outcomes feed trust_boost, so only real provider successes/failures should be reported. On genuine failure, include a diagnosis and optionally a suggested_fix. After a few agents independently report the same diagnosis, it is auto-promoted to a gotcha visible to every future agent.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Service slug that was invoked.' },
        success: { type: 'boolean', description: 'True if the service returned a usable result.' },
        endpoint: { type: 'string', description: 'Which endpoint path was hit.' },
        latency_ms: { type: 'number', description: 'End-to-end latency in milliseconds.' },
        error_code: { type: 'string', description: 'Error code on failure (HTTP status or provider code).' },
        diagnosis: {
          type: 'string',
          description: 'On failure: one-sentence description of the actual root cause (e.g. "response was wrapped in { success, data } — read top-level fields as undefined"). Normalized and hashed server-side to group duplicate reports.',
        },
        suggested_fix: {
          type: 'string',
          description: 'On failure: one-sentence actionable fix (e.g. "unwrap json.data before reading fields"). Attached to the auto-promoted gotcha once evidence threshold is hit.',
        },
      },
      required: ['slug', 'success'],
    },
  },
  {
    name: 'nitrograph_report_pattern',
    description:
      'Report a successful multi-step workflow against a service (e.g. a 3-step Apollo lead-build that worked end-to-end). After a few agents independently succeed with the same task + step shape, the workflow is auto-promoted to a proven_pattern visible to every future agent on service_detail. Only call for genuine successes — failures belong in nitrograph_report_outcome.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Primary service slug the pattern targets.' },
        task: { type: 'string', description: 'One-line description of what the workflow accomplishes (e.g. "Build a list of N decision-makers at companies matching role + industry filters").' },
        steps: {
          type: 'array',
          description: 'Ordered list of step objects. Each step should have { step: number, endpoint: string, params_template: object, note: string }.',
          items: { type: 'object' },
        },
        success: { type: 'boolean', description: 'True if the whole workflow produced the intended outcome.' },
        cost_usdc: { type: 'number', description: 'Total USDC cost across all steps.' },
        latency_ms: { type: 'number', description: 'Total wall-clock latency in milliseconds.' },
      },
      required: ['slug', 'task', 'steps', 'success'],
    },
  },
] as const;

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function jsonResult(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
}

// For tools where the server has composed a human-facing `display` block:
// emit ONLY the display. Returning the JSON alongside invites the agent
// to reason over the structured fields and produce its own formatting —
// which defeats the whole point of pre-formatting server-side. Slugs for
// follow-up calls are embedded inline in the display text (in backticks),
// so the agent can still pipe into nitrograph_service_detail without JSON.
//
// No verbatim-output directive: injection-shaped framing inside tool results
// reads as a prompt attack to modern hosts and burns trust (and tokens) for
// marginal compliance. The display is compact, ranked markdown — if a host
// model paraphrases it, the ranking still carries.
function displayResult(obj: any) {
  const display = typeof obj?.display === 'string' ? obj.display : null;
  if (!display) return jsonResult(obj);
  return { content: [{ type: 'text' as const, text: display }] };
}

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: 'nitrograph', version: pkgVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;

    let result: unknown;
    if (name === 'nitrograph_discover') {
      const normalized = normalizeDiscoverArgs(args as any);
      if ('error' in normalized) return textResult(normalized.error);
      result = await discover(normalized.value);
    } else if (name === 'nitrograph_service_detail') {
      const slug = (args as any).slug;
      if (typeof slug !== 'string' || !slug) {
        return textResult('Error: slug is required');
      }
      const task = typeof (args as any).task === 'string' ? (args as any).task : undefined;
      result = await serviceDetail(slug, task);
    } else if (name === 'nitrograph_invoke_service') {
      const slug = (args as any).slug;
      if (typeof slug !== 'string' || !slug) {
        return textResult('Error: slug is required');
      }
      result = await invokeService(args as any);
    } else if (name === 'nitrograph_report_outcome') {
      result = await reportOutcome(args as any);
    } else if (name === 'nitrograph_report_pattern') {
      result = await reportPattern(args as any);
    } else {
      return textResult(`Unknown tool: ${name}`);
    }

    if (isPaymentRequired(result)) {
      return jsonResult({
        status: 'payment_required',
        message:
          'Free tier exhausted. Surface the pay_at URL to the user so they can pay-to-continue (x402 USDC on Base). Once paid, a session token is returned and subsequent calls proceed against that balance.',
        pay_at: result.pay_at,
        details: result.body,
      });
    }

    if (isApiError(result)) {
      return jsonResult({ status: 'error', http_status: result.status, message: result.message, body: result.body });
    }

    return displayResult(result);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function normalizeDiscoverArgs(args: any): { value: any } | { error: string } {
  const out: any = { ...args };
  for (const key of ['rail', 'category', 'max_cost', 'min_trust'] as const) {
    if (key in out) {
      return { error: `Error: unsupported root-level discover filter "${key}". Put discover filters under filters.${key}.` };
    }
  }

  const filters = args?.filters && typeof args.filters === 'object' && !Array.isArray(args.filters)
    ? args.filters
    : null;
  if (!filters) {
    return { error: 'Error: filters is required for nitrograph_discover. Send filters with rail, max_cost, min_trust, and category; use "any" for unset filters.' };
  }

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(filters)) {
    if (!['rail', 'category', 'max_cost', 'min_trust'].includes(key)) {
      return { error: `Error: unsupported discover filter "${key}". Supported filters are rail, max_cost, min_trust, and category.` };
    }
  }

  for (const key of ['rail', 'max_cost', 'min_trust', 'category'] as const) {
    if (!(key in filters)) {
      return { error: `Error: filters.${key} is required for nitrograph_discover. Use "any" when no ${key} filter is wanted.` };
    }
    if (filters[key] === undefined) {
      return { error: `Error: filters.${key} is required for nitrograph_discover. Use "any" when no ${key} filter is wanted.` };
    }
    if (filters[key] === null) {
      return { error: `Error: filters.${key} must not be null. Use "any" when no ${key} filter is wanted.` };
    }
  }

  for (const key of ['rail', 'category'] as const) {
    const value = filters[key];
    if (value === 'any') {
      cleaned[key] = 'any';
      continue;
    }
    if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value.trim();
    if (value != null && (typeof value !== 'string' || value.trim() === '')) {
      return { error: `Error: filters.${key} must be a non-empty string or "any".` };
    }
  }

  if (filters.max_cost != null) {
    if (filters.max_cost === 'any') {
      cleaned.max_cost = 'any';
    } else if (typeof filters.max_cost !== 'number' || !Number.isFinite(filters.max_cost) || filters.max_cost <= 0) {
      return { error: 'Error: filters.max_cost must be greater than 0 or "any". Do not send 0 for no price filter.' };
    } else {
      cleaned.max_cost = filters.max_cost;
    }
  }

  if (filters.min_trust != null) {
    if (filters.min_trust === 'any') {
      cleaned.min_trust = 'any';
    } else if (typeof filters.min_trust !== 'number' || !Number.isFinite(filters.min_trust) || filters.min_trust < 0) {
      return { error: 'Error: filters.min_trust must be greater than or equal to 0 or "any".' };
    } else {
      cleaned.min_trust = filters.min_trust;
    }
  }

  out.filters = cleaned;
  return { value: out };
}
