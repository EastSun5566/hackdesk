import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const sourceIcon = join(rootDir, 'docs/public/logo.png');
const buildDir = join(rootDir, 'build');
const tempDir = mkdtempSync(join(tmpdir(), 'hackdesk-electron-icons-'));

mkdirSync(buildDir, { recursive: true });

try {
  execFileSync('pnpm', [
    'exec',
    'tauri',
    'icon',
    sourceIcon,
    '-o',
    tempDir,
  ], { cwd: rootDir, stdio: 'inherit' });

  for (const fileName of ['icon.png', 'icon.icns', 'icon.ico']) {
    copyFileSync(join(tempDir, fileName), join(buildDir, fileName));
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log('Generated Electron icons in build/.');
