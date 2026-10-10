import { chromium, expect, test } from '@playwright/test';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');
const productName = 'HackDesk';

// Read the binary path from the same package.json fields that
// `scripts/check-electron-fuses.ts` reads (single source of truth for
// where `electron-builder --dir` puts the unpacked output).
async function packagedBinaryPath(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  const output = pkg.build.directories.output;
  switch (process.platform) {
    case 'darwin':
      return join(repoRoot, output, process.arch === 'arm64' ? 'mac-arm64' : 'mac', `${productName}.app`, 'Contents', 'MacOS', productName);
    case 'win32':
      return join(repoRoot, output, 'win-unpacked', `${productName}.exe`);
    case 'linux':
      return join(repoRoot, output, 'linux-unpacked', pkg.name);
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

// CDP port must match the `--remote-debugging-port` arg below and is reserved
// per spec to keep CI logs deterministic. Electron with the project's fuse
// config (`EnableNodeCliInspectArguments = 0`) refuses `--inspect=0`, so
// `_electron.launch()` cannot attach; spawning the binary with
// `--remote-debugging-port` and connecting via Chromium DevTools Protocol is
// the attach path that survives the fuses.
const CDP_PORT = 9222;

test('packaged binary launches and serves the packaged renderer (#140)', async () => {
  // The unpacked binary is produced by `pnpm run package:check` earlier in
  // the same job. If it is missing the test is a setup error, not a flake.
  const bin = await packagedBinaryPath();
  await access(bin);

  // Isolated settings + vault. The packaged app reads $HOME/.hackdesk for its
  // config and $HOME/<vault> for the local vault. The settings file is
  // pre-seeded with `onboarding.hackmdTokenSetupDeferred: true` so the HackMD
  // onboarding dialog does not cover the workspace on first launch.
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-packaged-'));
  const vault = join(home, 'vault');
  await mkdir(vault);
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { path: vault },
    onboarding: { hackmdTokenSetupDeferred: true },
  }));

  // Only the unpacked Linux CI build bypasses Chromium's OS sandbox.
  // Keep macOS/Windows launch arguments and packaged Electron fuses intact.
  const spawnArgs = [
    `--user-data-dir=${join(home, 'user-data')}`,
    `--hackdesk-home=${home}`,
    `--remote-debugging-port=${CDP_PORT}`,
  ];
  if (process.platform === 'linux') {
    spawnArgs.unshift('--no-sandbox');
  }

  let proc: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  try {
    proc = spawn(bin, spawnArgs, {
      env: {
        // Make the dev-server override explicit; the packaged app must
        // still ignore it because `app.isPackaged` is true. The renderer
        // comes from the file system regardless of this env var.
        ...process.env,
        HACKDESK_ELECTRON_DEV_SERVER_URL: 'http://localhost:5173',
        HOME: home,
      },
      // `inherit` (not 'pipe') so that a stalled Electron doesn't fill the
      // pipe buffer and deadlock the child process -- an unpiped stdio
      // channel against an Electron process that prints a long stack trace
      // on startup is the most common cause of "the test hangs forever"
      // when the binary actually crashed.
      stdio: 'inherit',
    });

    // Two race fixes (verified against playwright-core 1.61.1):
    //
    //   1. `connectOverCDP` makes a single HTTP fetch of /json/version/ — it
    //      can reject with ECONNREFUSED if Electron has not bound port 9222
    //      yet. Poll for the endpoint until it answers.
    //   2. The DevTools endpoint starts listening during browser-process
    //      init, before the app creates its first BrowserWindow (after
    //      `ensureReadableSettings()` + `readStoredSettings()`). So at attach
    //      time `context.pages()` is often empty; fall back to waiting for
    //      the first `page` event so the test is deterministic regardless of
    //      which side came up first.
    const startupDeadline = Date.now() + 30_000;
    while (!browser && Date.now() < startupDeadline) {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        throw new Error(`Packaged app exited before CDP startup: code=${proc.exitCode}, signal=${proc.signalCode}`);
      }
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 5_000 }).catch(() => null);
      if (!browser) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!browser) {
      throw new Error(`CDP endpoint on port ${CDP_PORT} never came up`);
    }
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('No browser context available from CDP endpoint');
    }
    const page = context.pages()[0] ?? (await context.waitForEvent('page'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'No note selected' })).toBeVisible();

    // The first window must use the packaged renderer, not a dev-server URL.
    // `getProductionRendererUrl()` returns `hackdesk://renderer/index.html#/electron`
    // when `app.isPackaged` is true. A dev-server URL would be
    // `http://localhost:5173/...`; reject it.
    const url = page.url();
    expect(url).toBe('hackdesk://renderer/index.html#/electron');
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // ignore: closing a CDP connection when the underlying process is
        // already gone can throw; the SIGTERM below will reap it.
      });
    }
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      proc.kill('SIGTERM');
      // SIGKILL backstop after 5s -- Electron with hardened runtime on macOS
      // sometimes needs SIGKILL to exit cleanly when CDP closes.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (proc && proc.exitCode === null) {
            proc.kill('SIGKILL');
          }
          resolve();
        }, 5_000);
        proc!.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
});
