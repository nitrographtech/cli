import { loadConfig } from './config.js';

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

function baseUrl(): string {
  return process.env.NITROGRAPH_API_URL ?? loadConfig().api_url;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const url = `${baseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'nitrograph-cli/0.2.0',
        ...(init.headers ?? {}),
      },
    });
  } catch (err: any) {
    return { error: true, status: 0, message: `network error: ${err?.message ?? err}` };
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
    max_cost?: number;
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
