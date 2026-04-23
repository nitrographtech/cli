#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startServer } from './server.js';
import { runWizard } from './install.js';

function pkgVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'install' || cmd === 'init') {
    await runWizard();
    return;
  }

  if (cmd === 'server' || cmd === 'serve') {
    await startServer();
    return;
  }

  if (cmd === '--version' || cmd === '-v') {
    process.stdout.write(`nitrograph ${pkgVersion()}\n`);
    return;
  }

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(`nitrograph — CLI for the Nitrograph service discovery network

Usage:
  npx nitrograph             Install the MCP server into detected clients.
                             In a terminal → interactive wizard.
                             In an agent / CI / pipe → auto-installs into
                             every detected client with no prompts.
  npx nitrograph server      Run the MCP server (stdio transport)
  npx nitrograph --version   Print version

Tools exposed by the MCP server:
  nitrograph_discover          Search the service registry
  nitrograph_service_detail    Fetch full detail for a service slug
  nitrograph_report_outcome    Record success/failure of an invocation

Config: ~/.config/nitrograph/config.json
API:    https://api.nitrograph.com
`);
    return;
  }

  process.stderr.write(`Unknown command: ${cmd}\nRun \`npx nitrograph --help\` for usage.\n`);
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(`nitrograph: fatal: ${err?.message ?? err}\n`);
  process.exit(1);
});
