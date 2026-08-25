// `nitrograph login` - the wrangler-login of Nitrograph. Runs the existing
// device pairing flow (the /pair mint stays the source of truth), stores
// the resulting spend-capped key in the CLI config (0600), and the MCP
// server picks it up automatically. Nobody pastes ng_live_ by hand.
import { loadConfig, saveConfig, configPath } from './config.js';

const API = 'https://api.nitrograph.com';

export async function runLogin(): Promise<void> {
  const existing = loadConfig();
  if (existing.apiKey) {
    process.stdout.write(`Already logged in (key ending …${existing.apiKey.slice(-4)}).\nRun \`nitrograph logout\` first to re-pair.\n`);
    return;
  }
  const start = await fetch(`${API}/v1/auth/device/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'nitrograph-cli' }),
  });
  if (!start.ok) throw new Error(`pairing start failed (${start.status})`);
  const p = (await start.json()) as { user_code: string; verification_url: string; device_token: string; poll_interval_seconds: number; expires_in_seconds: number };

  process.stdout.write(`\n  Open   ${p.verification_url}\n  Enter  ${p.user_code}\n\nSign in (Google/GitHub/email, ~30s, no card) and approve. Waiting…\n`);

  const deadline = Date.now() + p.expires_in_seconds * 1000;
  for (;;) {
    if (Date.now() > deadline) { process.stderr.write('Pairing expired - run `nitrograph login` again.\n'); process.exit(1); }
    await new Promise((r) => setTimeout(r, (p.poll_interval_seconds || 5) * 1000));
    const poll = await fetch(`${API}/v1/auth/device/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_token: p.device_token }),
    });
    const body = (await poll.json()) as { status?: string; api_key?: string; error?: string };
    if (body.status === 'pending') continue;
    if (body.status === 'approved' && body.api_key) {
      const cfg = loadConfig();
      cfg.apiKey = body.api_key;
      saveConfig(cfg);
      process.stdout.write(`\nPaired. Key stored in ${configPath()} (0600).\n` +
        `Caps: $1/call, $20/day, $200/month - manage at https://nitrograph.com/dashboard/keys\n` +
        `Your first certified call is free ($1 promo credit seeded).\n`);
      return;
    }
    if (body.status === 'denied') { process.stderr.write('Pairing denied.\n'); process.exit(1); }
    if (body.status === 'expired' || body.error) { process.stderr.write(`Pairing ${body.status ?? body.error} - run \`nitrograph login\` again.\n`); process.exit(1); }
  }
}

export function runLogout(): void {
  const cfg = loadConfig();
  if (!cfg.apiKey) { process.stdout.write('Not logged in.\n'); return; }
  delete cfg.apiKey;
  saveConfig(cfg);
  process.stdout.write('Logged out - the key remains valid until revoked at https://nitrograph.com/dashboard/keys\n');
}
