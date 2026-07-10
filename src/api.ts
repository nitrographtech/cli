import { loadConfig } from './config.js';
import { pkgVersion } from './version.js';

export interface PaymentRequired {
  payment_required: true;
  pay_at: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface ApiError {
  error: true;
  status: number;
  message: string;
  body?: unknown;
}

export type ApiResult<T> = T | PaymentRequired | ApiError;

// Default client-side timeout for a call to api.nitrograph.com. Without one an
// agent's MCP tool call hangs indefinitely if the API stalls. Overridable per
// request (invoke needs a longer ceiling, see requestTimeoutFor) and globally
// via NITROGRAPH_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 30_000;

function baseUrl(): string {
  return process.env.NITROGRAPH_API_URL ?? loadConfig().api_url;
}

function defaultTimeoutMs(): number {
  const raw = Number(process.env.NITROGRAPH_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const url = `${baseUrl()}${path}`;
  const sessionToken = process.env.NITROGRAPH_SESSION_TOKEN ?? process.env.NITRO_AGENT_CHECKOUT_TOKEN;
  const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'user-agent': `nitrograph-cli/${pkgVersion()}`,
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      error: true,
      status: 0,
      message: isAbort
        ? `request timed out after ${timeoutMs}ms`
        : `network error: ${err?.message ?? err}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (res.status === 429 || res.status === 402) {
    const hdrs: Record<string, string> = {};
    res.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
    const payAt = hdrs['x-nitrograph-payment-required'] ?? '/v1/pay-to-continue';
    return {
      payment_required: true,
      pay_at: payAt,
      body,
      headers: hdrs,
    };
  }

  if (!res.ok) {
    const msg = (body && typeof body === 'object' && 'error' in (body as any))
      ? String((body as any).error)
      : `HTTP ${res.status}`;
    return { error: true, status: res.status, message: msg, body };
  }

  return body as T;
}

export interface DiscoverInput {
  query: string;
  limit?: number;
  filters?: {
    rail?: string;
    max_cost?: number | 'any';
    min_trust?: number | 'any';
    category?: string;
  };
}

export interface DiscoverResult {
  query: string;
  results: Array<Record<string, unknown>>;
  total_results: number;
}

export function discover(input: DiscoverInput): Promise<ApiResult<DiscoverResult>> {
  return request<DiscoverResult>('/v1/discover', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function serviceDetail(slug: string, task?: string): Promise<ApiResult<Record<string, unknown>>> {
  const qs = task && task.trim() !== '' ? `?task=${encodeURIComponent(task.trim())}` : '';
  return request<Record<string, unknown>>(`/v1/service/${encodeURIComponent(slug)}${qs}`, {
    method: 'GET',
  });
}

// MCP hosts frequently serialize the invoke `body` argument as a JSON string
// even when the schema asks for an object. Forwarding that string verbatim
// gets stringified again at the proxy, so the provider receives double-encoded
// JSON and rejects the call. Parse it back when the body is meant to be JSON.
export function normalizeJsonBody(body: unknown, bodyType?: string): unknown {
  if (typeof body !== 'string') return body;
  if (bodyType != null && bodyType !== 'json') return body;
  const trimmed = body.trim();
  if (!/^[[{"]/.test(trimmed) && trimmed !== 'true' && trimmed !== 'false' && trimmed !== 'null' && !/^-?\d/.test(trimmed)) {
    return body;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return body;
  }
}

export interface InvokeServiceInput {
  slug: string;
  endpoint_index?: number;
  query?: Record<string, unknown>;
  body?: unknown;
  body_type?: 'json' | 'form-data' | 'text';
  headers?: Record<string, string>;
  timeout_ms?: number;
}

export function invokeService(input: InvokeServiceInput): Promise<ApiResult<Record<string, unknown>>> {
  const { slug, ...rest } = input;
  const body = {
    ...rest,
    ...(rest.body !== undefined ? { body: normalizeJsonBody(rest.body, rest.body_type) } : {}),
  };
  // Invoke proxies a live provider call whose server-side ceiling is 60s. The
  // client timeout must clear that plus network overhead, or a legitimately
  // slow provider call would be aborted here before the server responds.
  const providerTimeout = Number.isFinite(rest.timeout_ms as number) ? Number(rest.timeout_ms) : 60_000;
  const timeoutMs = Math.min(providerTimeout, 60_000) + 10_000;
  return request<Record<string, unknown>>(
    `/v1/service/${encodeURIComponent(slug)}/invoke`,
    { method: 'POST', body: JSON.stringify(body) },
    { timeoutMs },
  );
}

export interface ReportOutcomeInput {
  slug: string;
  success: boolean;
  endpoint?: string;
  latency_ms?: number;
  error_code?: string;
  diagnosis?: string;
  suggested_fix?: string;
}

export function reportOutcome(input: ReportOutcomeInput): Promise<ApiResult<Record<string, unknown>>> {
  const { slug, ...body } = input;
  return request<Record<string, unknown>>(
    `/v1/service/${encodeURIComponent(slug)}/report-outcome`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export interface ReportPatternInput {
  slug: string;
  task: string;
  steps: unknown[];
  success: boolean;
  cost_usdc?: number;
  latency_ms?: number;
}

export function reportPattern(input: ReportPatternInput): Promise<ApiResult<Record<string, unknown>>> {
  const { slug, ...body } = input;
  return request<Record<string, unknown>>(
    `/v1/service/${encodeURIComponent(slug)}/report-pattern`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function isPaymentRequired(r: ApiResult<unknown>): r is PaymentRequired {
  return typeof r === 'object' && r !== null && (r as any).payment_required === true;
}

export function isApiError(r: ApiResult<unknown>): r is ApiError {
  return typeof r === 'object' && r !== null && (r as any).error === true;
}
