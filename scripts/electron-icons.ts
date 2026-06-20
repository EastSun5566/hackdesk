import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const sourceIcon = join(rootDir, 'docs/public/logo.png');
const buildDir = join(rootDir, 'build');
const tempDir = mkdtempSync(join(tmpdir(), 'hackdesk-electron-icons-'));
const pnpmArgs = ['exec', 'tauri', 'icon', sourceIcon, '-o', tempDir];
const pnpmExecPath = process.env.npm_config_user_agent?.startsWith('pnpm') ? process.env.npm_execpath : undefined;
const commandOptions: ExecFileSyncOptions = { cwd: rootDir, stdio: 'inherit' };

function quoteCmdArg(arg: string): string {
  return `"${arg.replaceAll('"', '""')}"`;
}

function runPnpm(args: readonly string[]): void {
  if (pnpmExecPath) {
    execFileSync(process.execPath, [pnpmExecPath, ...args], commandOptions);
    return;
  }

  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args].map(quoteCmdArg).join(' ')], commandOptions);
    return;
  }

  execFileSync('pnpm', args, commandOptions);
}

mkdirSync(buildDir, { recursive: true });

try {
  runPnpm(pnpmArgs);

  for (const fileName of ['icon.png', 'icon.icns', 'icon.ico']) {
    copyFileSync(join(tempDir, fileName), join(buildDir, fileName));
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log('Generated Electron icons in build/.');
