// `nitrograph login` - the wrangler-login of Nitrograph. Runs the existing
// device pairing flow (the /pair mint stays the source of truth), stores
// the resulting spend-capped key in the CLI config (0600), and the MCP
// server picks it up automatically. Nobody pastes ng_live_ by hand.
//
// `authenticate()` is the same mint, exposed as the MCP tool
// nitrograph_authenticate (hosted and local). No-args starts pairing;
// device_token polls once; api_key verifies and reports plan.
import { loadConfig, saveConfig, configPath, storeClaimedKey } from './config.js';
import {
  startDevicePairing,
  pollDevicePairing,
  verifyApiKey,
  isApiError,
  isPaymentRequired,
  type ApiResult,
} from './api.js';

export async function runLogin(): Promise<void> {
  const existing = loadConfig();
  if (existing.apiKey) {
    process.stdout.write(`Already logged in (key ending …${existing.apiKey.slice(-4)}).\nRun \`nitrograph logout\` first to re-pair.\n`);
    return;
  }
  const start = await startDevicePairing('nitrograph-cli');
  if (isApiError(start) || isPaymentRequired(start)) {
    const status = isApiError(start) ? start.status : 402;
    throw new Error(`pairing start failed (${status})`);
  }

  process.stdout.write(`\n  Open   ${start.verification_url}\n  Enter  ${start.user_code}\n\nSign in (Google/GitHub/email, ~30s, no card) and approve. Waiting…\n`);

  const deadline = Date.now() + start.expires_in_seconds * 1000;
  for (;;) {
    if (Date.now() > deadline) { process.stderr.write('Pairing expired - run `nitrograph login` again.\n'); process.exit(1); }
    await new Promise((r) => setTimeout(r, (start.poll_interval_seconds || 5) * 1000));
    const poll = await pollDevicePairing(start.device_token);
    if (isApiError(poll) || isPaymentRequired(poll)) {
      process.stderr.write(`Pairing ${isApiError(poll) ? poll.message : 'failed'} - run \`nitrograph login\` again.\n`);
      process.exit(1);
    }
    if (poll.status === 'pending') continue;
    if (poll.status === 'approved' && poll.api_key) {
      storeClaimedKey(poll.api_key);
      process.stdout.write(`\nPaired. Key stored in ${configPath()} (0600).\n` +
        `Caps: $1/call, $20/day, $200/month - manage at https://nitrograph.com/dashboard/keys\n` +
        `Your first certified call is free ($1 promo credit seeded).\n`);
      return;
    }
    if (poll.status === 'denied') { process.stderr.write('Pairing denied.\n'); process.exit(1); }
    if (poll.status === 'expired' || poll.error) { process.stderr.write(`Pairing ${poll.status ?? poll.error} - run \`nitrograph login\` again.\n`); process.exit(1); }
  }
}

export function runLogout(): void {
  const cfg = loadConfig();
  if (!cfg.apiKey) { process.stdout.write('Not logged in.\n'); return; }
  delete cfg.apiKey;
  saveConfig(cfg);
  process.stdout.write('Logged out - the key remains valid until revoked at https://nitrograph.com/dashboard/keys\n');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function keyLooksValid(session: Record<string, unknown>): boolean {
  if (session.valid === false) return false;
  return session.authenticated === true || session.valid === true;
}

/**
 * MCP `nitrograph_authenticate` — same shape as hosted /mcp.
 * - api_key: verify the key and report plan; persist it if valid
 * - device_token: poll once; persist the claimed key on approval
 * - no args: start device pairing
 */
export async function authenticate(
  args: { api_key?: unknown; device_token?: unknown } = {},
): Promise<ApiResult<Record<string, unknown>>> {
  const apiKey = optionalString(args.api_key);
  const deviceToken = optionalString(args.device_token);

  if (apiKey) {
    const session = await verifyApiKey(apiKey);
    if (isApiError(session) || isPaymentRequired(session)) return session;
    if (keyLooksValid(session)) {
      const stored_in = storeClaimedKey(apiKey);
      return { ...session, stored_in };
    }
    return session;
  }

  if (deviceToken) {
    const poll = await pollDevicePairing(deviceToken);
    if (isApiError(poll) || isPaymentRequired(poll)) return poll;
    if (poll.status === 'approved' && poll.api_key) {
      const stored_in = storeClaimedKey(poll.api_key);
      return {
        ...poll,
        stored_in,
        note: `Key stored in ${stored_in} (0600). Subsequent local MCP calls use it automatically.`,
      };
    }
    return { ...poll };
  }

  const start = await startDevicePairing('nitrograph-mcp');
  if (isApiError(start) || isPaymentRequired(start)) return start;
  return { ...start };
}
