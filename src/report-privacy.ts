/** Best-effort defense before optional reports leave the device, not a DLP guarantee. */
const PRIVATE_FIELD = /authorization|cookie|password|secret|token|api[_-]?key|private[_-]?key|email|phone|address|card|cvv|ssn|health|medical|patient|chat|prompt|payload|response|body/i;

export function redactText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[redacted key]')
    .slice(0, 4000)
    .replace(/\b(?:Bearer\s+\S+|(?:ng_live_|sk_live_|sk_test_|sk-proj-|ghp_|github_pat_)[\w-]+)/gi, '[redacted credential]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[redacted email]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted number]')
    .replace(/\b(?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted credential]')
    .replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
      try { return new URL(raw).origin + '/[reported endpoint]'; } catch { return '[redacted URL]'; }
    });
}

export function redactReport(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[omitted]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 32).map((v) => redactReport(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 32).map(([k, v]) =>
    [redactText(k), PRIVATE_FIELD.test(k) ? '[redacted]' : k === 'endpoint' ? '[reported endpoint]' : redactReport(v, depth + 1)]));
  return value;
}
