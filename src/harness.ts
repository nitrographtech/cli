/**
 * Agent Harness — typed client over the Nitrograph REST API.
 *
 * Separate from the MCP server path (server.ts / api.ts). Exposed as the
 * library entrypoint of the `nitrograph` npm package so agents can embed
 * discovery + reporting directly in code without going through an MCP host.
 */

const DEFAULT_API_URL = 'https://api.nitrograph.com';
const DEFAULT_TIMEOUT_MS = 15_000;

export interface NitrographOptions {
  apiUrl?: string;
  sessionToken?: string;
  timeoutMs?: number;
  userAgent?: string;
  fetch?: typeof fetch;
}

export interface DiscoverFilters {
  rail?: 'x402' | 'mpp' | 'stripe' | 'none' | string;
  max_cost?: number;
  category?: string;
}

export interface DiscoverInput {
  query: string;
  limit?: number;
  filters?: DiscoverFilters;
}

export interface DiscoveredService {
  slug: string;
  display_slug?: string;
  name: string;
  description?: string | null;
  rail?: string | null;
  rails?: string[] | null;
  cost_per_call?: number | null;
  trust_score?: number | null;
  legitimacy_score?: number | null;
  rankability_score?: number | null;
  trust_boost?: number | null;
  match_reason?: 'strict' | 'fallback' | string;
  match_strength?: 'strong' | 'related' | string;
  endpoint_count?: number | null;
  [key: string]: unknown;
}

export interface DiscoverResponse {
  query: string;
  results: DiscoveredService[];
  related_results?: DiscoveredService[];
  total_results: number;
  recommended_count?: number;
  related_count?: number;
  weak_matches_available?: boolean;
  display?: string;
  [key: string]: unknown;
}

export interface ServiceDetail {
  slug: string;
  name: string;
  description?: string | null;
  endpoint_url?: string | null;
  rail?: string | null;
  rails?: string[] | null;
  cost_per_call?: number | null;
  endpoints?: unknown[];
  call_card?: unknown;
  openapi_spec?: unknown;
  gotchas?: unknown[];
  proven_patterns?: unknown[];
  reliability?: { successful: number; total: number; rate: number } | null;
  [key: string]: unknown;
}

export interface ReportOutcomeInput {
  slug: string;
  success: boolean;
  endpoint?: string;
  latencyMs?: number;
  errorCode?: string;
  diagnosis?: string;
  suggestedFix?: string;
}

export interface PatternStep {
  step: number;
  endpoint: string;
  params_template?: Record<string, unknown>;
  note?: string;
  [key: string]: unknown;
}

export interface ReportPatternInput {
  slug: string;
  task: string;
  steps: PatternStep[] | Array<Record<string, unknown>>;
  success: boolean;
  costUsdc?: number;
  latencyMs?: number;
}

/**
 * Base class so consumers can `err instanceof NitrographError` before
 * drilling into the subclass type.
 */
export class NitrographError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NitrographError';
  }
}

export class NitrographApiError extends NitrographError {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'NitrographApiError';
    this.status = status;
    this.body = body;
  }
}

export class NitrographPaymentRequiredError extends NitrographError {
  payAt: string;
  body: unknown;
  headers: Record<string, string>;
  constructor(payAt: string, body: unknown, headers: Record<string, string>) {
    super('payment required — free tier exhausted; pay at ' + payAt);
    this.name = 'NitrographPaymentRequiredError';
    this.payAt = payAt;
    this.body = body;
    this.headers = headers;
  }
}

export class NitrographNetworkError extends NitrographError {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NitrographNetworkError';
    this.cause = cause;
  }
}

export class Nitrograph {
  private readonly apiUrl: string;
  private readonly sessionToken?: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: NitrographOptions = {}) {
    this.apiUrl = (opts.apiUrl ?? process.env.NITROGRAPH_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
    this.sessionToken = opts.sessionToken ?? process.env.NITROGRAPH_SESSION_TOKEN;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = opts.userAgent ?? `nitrograph-harness/${LIB_VERSION}`;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async discover(input: DiscoverInput | string, filtersOrOpts?: { limit?: number } & DiscoverFilters): Promise<DiscoverResponse> {
    const payload: DiscoverInput = typeof input === 'string'
      ? {
          query: input,
          ...(filtersOrOpts?.limit != null ? { limit: filtersOrOpts.limit } : {}),
          ...(this.pickFilters(filtersOrOpts) ? { filters: this.pickFilters(filtersOrOpts)! } : {}),
        }
      : input;
    return this.request<DiscoverResponse>('POST', '/v1/discover', payload);
  }

  async serviceDetail(slug: string, opts: { task?: string } | string = {}): Promise<ServiceDetail> {
    if (!slug) throw new NitrographError('slug is required');
    const task = typeof opts === 'string' ? opts : opts.task;
    const qs = task && task.trim() !== '' ? `?task=${encodeURIComponent(task.trim())}` : '';
    return this.request<ServiceDetail>('GET', `/v1/service/${encodeURIComponent(slug)}${qs}`);
  }

  async reportOutcome(input: ReportOutcomeInput): Promise<unknown> {
    const { slug, latencyMs, errorCode, suggestedFix, ...rest } = input;
    const body = {
      ...rest,
      ...(latencyMs != null ? { latency_ms: latencyMs } : {}),
      ...(errorCode != null ? { error_code: errorCode } : {}),
      ...(suggestedFix != null ? { suggested_fix: suggestedFix } : {}),
    };
    return this.request<unknown>(
      'POST',
      `/v1/service/${encodeURIComponent(slug)}/report-outcome`,
      body,
    );
  }

  async reportPattern(input: ReportPatternInput): Promise<unknown> {
    const { slug, costUsdc, latencyMs, ...rest } = input;
    const body = {
      ...rest,
      ...(costUsdc != null ? { cost_usdc: costUsdc } : {}),
      ...(latencyMs != null ? { latency_ms: latencyMs } : {}),
    };
    return this.request<unknown>(
      'POST',
      `/v1/service/${encodeURIComponent(slug)}/report-pattern`,
      body,
    );
  }

  private pickFilters(o: ({ limit?: number } & DiscoverFilters) | undefined): DiscoverFilters | null {
    if (!o) return null;
    const { rail, max_cost, category } = o;
    if (rail == null && max_cost == null && category == null) return null;
    const f: DiscoverFilters = {};
    if (rail != null) {
      const normalized = String(rail).trim();
      if (!normalized) throw new NitrographError('rail filter must be non-empty; omit rail for no rail filter');
      f.rail = normalized;
    }
    if (max_cost != null) {
      if (!Number.isFinite(max_cost) || max_cost <= 0) {
        throw new NitrographError('max_cost must be greater than 0; omit max_cost for no price filter');
      }
      f.max_cost = max_cost;
    }
    if (category != null) {
      const normalized = String(category).trim();
      if (!normalized) throw new NitrographError('category filter must be non-empty; omit category for no category filter');
      f.category = normalized;
    }
    if (Object.keys(f).length === 0) return null;
    return f;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': this.userAgent,
    };
    if (this.sessionToken) headers['authorization'] = `Bearer ${this.sessionToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort ? `request timed out after ${this.timeoutMs}ms` : `network error: ${this.errMessage(err)}`;
      throw new NitrographNetworkError(msg, err);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (res.status === 402 || res.status === 429) {
      const hdrs: Record<string, string> = {};
      res.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
      const payAt = hdrs['x-nitrograph-payment-required']
        ?? this.extractPayAt(parsed)
        ?? `${this.apiUrl}/v1/pay-to-continue`;
      throw new NitrographPaymentRequiredError(payAt, parsed, hdrs);
    }

    if (!res.ok) {
      const msg = this.extractError(parsed) ?? `HTTP ${res.status}`;
      throw new NitrographApiError(msg, res.status, parsed);
    }

    return parsed as T;
  }

  private errMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
  }

  private extractError(body: unknown): string | null {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (typeof b.error === 'string') return b.error;
      if (typeof b.message === 'string') return b.message;
    }
    return null;
  }

  private extractPayAt(body: unknown): string | null {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (typeof b.pay_at === 'string') return b.pay_at;
      const ch = b.challenge;
      if (ch && typeof ch === 'object' && typeof (ch as any).pay_at === 'string') {
        return (ch as any).pay_at as string;
      }
    }
    return null;
  }
}

/**
 * Convenience factory so callers can `createNitrograph()` instead of `new Nitrograph()`.
 */
export function createNitrograph(opts: NitrographOptions = {}): Nitrograph {
  return new Nitrograph(opts);
}

// Kept in sync with package.json by the build. Read lazily at import time so
// bumping version in package.json does not require touching this file.
// (The CLI reads the same file from disk — here we inline a literal because
// library consumers may be bundling and we can't assume fs access.)
const LIB_VERSION = '0.5.1';
