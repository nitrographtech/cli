import { stdout } from 'node:process';

// Zero-dep ANSI. Only emit colors when stdout is a real TTY and the
// environment hasn't opted out (NO_COLOR, dumb TERM). Non-TTY paths
// (agent Bash tools, CI) get plain text so escape codes don't leak
// into captured output.
const colorOn =
  stdout.isTTY === true &&
  process.env.NO_COLOR !== '1' &&
  process.env.TERM !== 'dumb';

type Palette = {
  reset: string; bold: string; dim: string;
  cyan: string; magenta: string; yellow: string;
  green: string; red: string; gray: string;
};

const ON: Palette = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

const OFF: Palette = {
  reset: '', bold: '', dim: '', cyan: '', magenta: '',
  yellow: '', green: '', red: '', gray: '',
};

export const c: Palette = colorOn ? ON : OFF;

// Block-letter "NITROGRAPH" in Unicode half-blocks. 4 rows, ~52 chars wide —
// fits in an 80-col terminal with room to spare. We don't use figlet at
// runtime because a runtime dep just for a banner is silly; the art is
// embedded verbatim.
const ART = [
  '███╗   ██╗██╗████████╗██████╗  ██████╗  ██████╗ ██████╗  █████╗ ██████╗ ██╗  ██╗',
  '████╗  ██║██║╚══██╔══╝██╔══██╗██╔═══██╗██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██║  ██║',
  '██╔██╗ ██║██║   ██║   ██████╔╝██║   ██║██║  ███╗██████╔╝███████║██████╔╝███████║',
  '██║╚██╗██║██║   ██║   ██╔══██╗██║   ██║██║   ██║██╔══██╗██╔══██║██╔═══╝ ██╔══██║',
  '██║ ╚████║██║   ██║   ██║  ██║╚██████╔╝╚██████╔╝██║  ██║██║  ██║██║     ██║  ██║',
  '╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝',
];

export function printBanner(): void {
  stdout.write('\n');
  for (const line of ART) {
    stdout.write(`  ${c.magenta}${line}${c.reset}\n`);
  }
  stdout.write(`\n  ${c.dim}the service discovery network for agents${c.reset}\n`);
  stdout.write(`  ${c.dim}──────────────────────────────────────────${c.reset}\n\n`);
}

export function section(title: string): void {
  stdout.write(`\n  ${c.yellow}${c.bold}${title}${c.reset}\n`);
  stdout.write(`  ${c.yellow}${'─'.repeat(title.length)}${c.reset}\n`);
}

export function tool(name: string, desc: string): void {
  stdout.write(`    ${c.cyan}${name.padEnd(28)}${c.reset}${c.dim}${desc}${c.reset}\n`);
}

export function ok(msg: string): void {
  stdout.write(`  ${c.green}✓${c.reset} ${msg}\n`);
}

export function info(msg: string): void {
  stdout.write(`  ${c.dim}${msg}${c.reset}\n`);
}
