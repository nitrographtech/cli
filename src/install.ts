import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig, saveConfig, configPath } from './config.js';
import { printBanner, section, tool, ok, info, c } from './banner.js';

interface ClientTarget {
  id: string;
  label: string;
  configPath: string;
  // Where in the config JSON to put the MCP server entry.
  insert: (json: any, entry: McpServerEntry) => any;
}

interface McpServerEntry {
  command: string;
  args: string[];
}

const ENTRY_NAME = 'nitrograph';

const ENTRY: McpServerEntry = {
  command: 'npx',
  args: ['-y', 'nitrograph', 'server'],
};

function home(...parts: string[]): string {
  return join(homedir(), ...parts);
}

function clientTargets(): ClientTarget[] {
  const isMac = platform() === 'darwin';
  const isWin = platform() === 'win32';

  const targets: ClientTarget[] = [];

  // Claude Desktop
  const claudeDesktop = isMac
    ? home('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : isWin
    ? join(process.env.APPDATA ?? home('AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
    : home('.config', 'Claude', 'claude_desktop_config.json');
  targets.push({
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: claudeDesktop,
    insert: (json, entry) => {
      json.mcpServers ??= {};
      json.mcpServers[ENTRY_NAME] = entry;
      return json;
    },
  });

  // Cursor
  targets.push({
    id: 'cursor',
    label: 'Cursor',
    configPath: home('.cursor', 'mcp.json'),
    insert: (json, entry) => {
      json.mcpServers ??= {};
      json.mcpServers[ENTRY_NAME] = entry;
      return json;
    },
  });

  // Windsurf
  targets.push({
    id: 'windsurf',
    label: 'Windsurf',
    configPath: home('.codeium', 'windsurf', 'mcp_config.json'),
    insert: (json, entry) => {
      json.mcpServers ??= {};
      json.mcpServers[ENTRY_NAME] = entry;
      return json;
    },
  });

  // Claude Code (project-local .mcp.json in cwd, or user-scoped)
  targets.push({
    id: 'claude-code',
    label: 'Claude Code (user scope)',
    configPath: home('.claude.json'),
    insert: (json, entry) => {
      json.mcpServers ??= {};
      json.mcpServers[ENTRY_NAME] = entry;
      return json;
    },
  });

  return targets;
}

function detectInstalled(targets: ClientTarget[]): ClientTarget[] {
  return targets.filter((t) => existsSync(t.configPath) || existsSync(dirname(t.configPath)));
}

function readJson(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(path: string, obj: any): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

async function prompt(rl: ReturnType<typeof createInterface>, q: string, def?: string): Promise<string> {
  const suffix = def ? ` [${def}]` : '';
  const ans = (await rl.question(`${q}${suffix}: `)).trim();
  return ans || def || '';
}

// Install into every target, writing a .bak backup for each existing config.
// Returns the list of targets actually written so the caller can report them.
function installInto(picks: ClientTarget[]): ClientTarget[] {
  for (const t of picks) {
    const json = readJson(t.configPath);
    const updated = t.insert(json, ENTRY);
    writeJson(t.configPath, updated);
    ok(`Installed into ${c.bold}${t.label}${c.reset}`);
  }
  return picks;
}

// Printed at the end of every successful install — the curl one-liner lets
// agents query immediately without waiting for their client to reload MCP
// servers (MCP registration only takes effect on next client start).
function printPostInstall(): void {
  section('Tools available after MCP client restart');
  tool('nitrograph_discover', 'Search the registry of agent-usable services');
  tool('nitrograph_service_detail', 'Full detail for a service (endpoints, schemas, health)');
  tool('nitrograph_report_outcome', 'Report success/failure of an invocation');
  tool('nitrograph_report_pattern', 'Report a working multi-step workflow');

  section('Query right now (no restart needed)');
  stdout.write(`    ${c.dim}curl -sX POST https://api.nitrograph.com/v1/discover \\${c.reset}\n`);
  stdout.write(`      ${c.dim}-H 'content-type: application/json' \\${c.reset}\n`);
  stdout.write(`      ${c.dim}-d '{"query":"<what you need>"}'${c.reset}\n\n`);
}

// Non-interactive install path — taken when stdin isn't a TTY (e.g. an agent
// invoking `npx nitrograph` through its Bash tool) or when `--yes`/`--all`
// was passed. Installs into every detected client with no prompting.
function runHeadless(detected: ClientTarget[], allTargets: ClientTarget[]): void {
  printBanner();
  info('non-interactive install (no TTY detected)');

  if (detected.length === 0) {
    section('No MCP clients detected');
    info('Paste this server entry into your MCP client config under "mcpServers":');
    stdout.write('\n');
    stdout.write(`    ${c.cyan}"${ENTRY_NAME}"${c.reset}: ${JSON.stringify(ENTRY, null, 2).split('\n').join('\n    ')}\n\n`);
    section('Candidate config paths');
    allTargets.forEach((t) => stdout.write(`    ${c.dim}•${c.reset} ${c.bold}${t.label}${c.reset}: ${c.dim}${t.configPath}${c.reset}\n`));
    printPostInstall();
    return;
  }

  section('Detected clients');
  detected.forEach((t) => stdout.write(`    ${c.green}•${c.reset} ${c.bold}${t.label}${c.reset} ${c.dim}${t.configPath}${c.reset}\n`));
  stdout.write('\n');

  installInto(detected);
  saveConfig(loadConfig());
  printPostInstall();
}

export async function runWizard(): Promise<void> {
  const targets = clientTargets();
  const detected = detectInstalled(targets);

  // Non-TTY stdin means no human is driving this — an agent's Bash tool, CI,
  // or a pipe. Prompting would hang forever, so branch to a headless path that
  // installs into every detected client and emits a result agents can parse.
  if (!stdin.isTTY) {
    runHeadless(detected, targets);
    return;
  }

  printBanner();

  const cfg = loadConfig();

  if (detected.length === 0) {
    section('No MCP clients detected');
    info('Checked: Claude Desktop, Cursor, Windsurf, Claude Code');
    stdout.write('\n');
    targets.forEach((t) => stdout.write(`    ${c.dim}• ${t.configPath}${c.reset}\n`));
    stdout.write(`\n  Install an MCP client first, then re-run ${c.cyan}npx nitrograph${c.reset}.\n\n`);
    return;
  }

  section('Detected clients');
  detected.forEach((t, i) => stdout.write(`    ${c.yellow}${i + 1}.${c.reset} ${c.bold}${t.label}${c.reset} ${c.dim}${t.configPath}${c.reset}\n`));
  stdout.write('\n');

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const selection = await prompt(
      rl,
      `  Which to install into? (comma-separated numbers, or "all")`,
      'all',
    );

    const picks = selection === 'all'
      ? detected
      : selection.split(',').map((s) => detected[parseInt(s.trim(), 10) - 1]).filter(Boolean);

    if (picks.length === 0) {
      stdout.write('  No clients selected. Aborting.\n');
      return;
    }

    installInto(picks);

    section('Config written');
    stdout.write(`    ${c.dim}${configPath()}${c.reset}\n`);
    saveConfig(cfg);

    printPostInstall();
  } finally {
    rl.close();
  }
}
