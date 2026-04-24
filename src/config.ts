import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

export interface NitrographConfig {
  api_url: string;
}

const DEFAULT_CONFIG: NitrographConfig = {
  api_url: 'https://api.nitrograph.com',
};

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, 'nitrograph') : join(homedir(), '.config', 'nitrograph');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function loadConfig(): NitrographConfig {
  const p = configPath();
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(p, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: NitrographConfig): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}
