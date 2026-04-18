import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig, saveConfig, configPath } from './config.js';

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

export async function runWizard(): Promise<void> {
  stdout.write('\n  Nitrograph install wizard\n');
  stdout.write('  =========================\n\n');

  const cfg = loadConfig();

  const targets = clientTargets();
  const detected = detectInstalled(targets);

  if (detected.length === 0) {
    stdout.write('  No MCP clients detected (Claude Desktop, Cursor, Windsurf, Claude Code).\n');
    stdout.write(`  Config directory checked: ${targets.map((t) => t.configPath).join('\n    ')}\n\n`);
    stdout.write('  Install an MCP client first, then re-run `npx nitrograph`.\n\n');
    return;
  }

  stdout.write('  Detected clients:\n');
  detected.forEach((t, i) => stdout.write(`    ${i + 1}. ${t.label} (${t.configPath})\n`));
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

    for (const t of picks) {
      const json = readJson(t.configPath);
      const updated = t.insert(json, ENTRY);
      writeJson(t.configPath, updated);
      stdout.write(`  ✓ Installed into ${t.label}\n`);
    }

    stdout.write('\n  Config written:\n');
    stdout.write(`    ${configPath()}\n`);
    saveConfig(cfg);

    stdout.write('\n  Restart the MCP client to pick up the new server.\n');
    stdout.write('  Three tools will be available:\n');
    stdout.write('    • nitrograph_discover\n');
    stdout.write('    • nitrograph_service_detail\n');
    stdout.write('    • nitrograph_report_outcome\n\n');
  } finally {
    rl.close();
  }
}
