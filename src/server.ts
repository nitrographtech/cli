import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  discover,
  serviceDetail,
  reportOutcome,
  reportPattern,
  isPaymentRequired,
  isApiError,
} from './api.js';

const TOOLS = [
  {
    name: 'nitrograph_discover',
    description:
      'Search the Nitrograph registry of agent-usable services. Returns a ranked, pre-formatted markdown list — one numbered row per service with name, slug (in backticks for follow-up calls), cost/call, trust score, rail, endpoint count, and description. Trust score combines legitimacy (is this real?), rankability (can an agent tell what it does?), and trust_boost (how has it performed for prior agents?); the ranker multiplies all three with query similarity. Every row also carries match_reason — "strict" rows matched all filters you passed, "fallback" rows come from a rail-only backfill when the strict pool was thin. OUTPUT CONTRACT: the tool result IS the response. Output it to the user exactly as returned. Do not re-group by category. Do not add recommendations, commentary, or "Notably absent" notes. Do not reorder rows. Do not strip any columns. The numbered order is the authoritative ranking. To follow up on a specific service, extract its slug from the backticks and call nitrograph_service_detail.',
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
          properties: {
            rail: { type: 'string', description: 'Payment rail: x402, mpp, stripe, none.' },
            max_cost: { type: 'number', description: 'Max cost per call in USD.' },
            category: { type: 'string', description: 'Service category filter.' },
          },
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'nitrograph_service_detail',
    description:
      'Fetch full detail for a single service by slug: endpoints, OpenAPI spec (if available), cost, base URL, current health, any gotchas/patterns the probe fleet and prior agents have mapped, and reliability (successful calls ÷ total calls from report_outcome data). Call after nitrograph_discover to get enough detail to invoke the service.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Service slug as returned by nitrograph_discover.' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'nitrograph_report_outcome',
    description:
      'Report the outcome of a call to a discovered service. Always call this after an invocation, success or failure — outcomes feed trust_boost, which slides the service up or down in future ranks. On failure, include a diagnosis (one sentence describing what broke) and optionally a suggested_fix. After a few agents independently report the same diagnosis, it is auto-promoted to a gotcha visible to every future agent. This is how the network compounds.',
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
function displayResult(obj: any) {
  const display = typeof obj?.display === 'string' ? obj.display : null;
  if (!display) return jsonResult(obj);
  return { content: [{ type: 'text' as const, text: display }] };
}

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: 'nitrograph', version: '0.2.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;

    let result: unknown;
    if (name === 'nitrograph_discover') {
      result = await discover(args as any);
    } else if (name === 'nitrograph_service_detail') {
      const slug = (args as any).slug;
      if (typeof slug !== 'string' || !slug) {
        return textResult('Error: slug is required');
      }
      result = await serviceDetail(slug);
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
