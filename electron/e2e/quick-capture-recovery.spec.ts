import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');
const recoveryStorageKey = 'hackdesk_note_workspace:local';

async function launchApp(home: string, userData: string, openQuickCapture = false) {
  return electron.launch({
    args: [
      repoRoot,
      `--user-data-dir=${userData}`,
      `--hackdesk-home=${home}`,
      ...(openQuickCapture ? ['--quick-capture'] : []),
    ],
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
    },
  });
}

async function stopAfterCrash(app: ElectronApplication) {
  const exited = new Promise<void>((resolveExit) => app.process().once('exit', () => resolveExit()));
  app.process().kill('SIGKILL');
  await exited;
}

test('recovers an accepted Quick Capture after restart and clears recovery after save', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-smoke-'));
  const userData = join(home, 'user-data');
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault, { recursive: true });
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { path: vault },
  }));

  const capturedText = `Recovered capture ${Date.now()}`;
  const firstApp = await launchApp(home, userData, true);
  let firstAppCrashed = false;
  try {
    await expect.poll(() => firstApp.windows().map((page) => page.url())).toEqual(expect.arrayContaining([
      expect.stringContaining('#/electron'),
      expect.stringContaining('#/quick-capture'),
    ]));
    const firstMain = firstApp.windows().find((page) => page.url().includes('#/electron'))!;
    const quickCapture = firstApp.windows().find((page) => page.url().includes('#/quick-capture'))!;

    await expect(firstMain.getByText('Local Vault', { exact: true }).first()).toBeVisible();
    await quickCapture.getByLabel('Capture note').fill(capturedText);
    await quickCapture.getByRole('button', { name: 'Capture' }).click();
    await expect(firstMain.locator('.cm-content')).toContainText(capturedText);
    await expect.poll(() => firstMain.evaluate((key) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { drafts?: Record<string, unknown> };
      return Object.keys(stored.drafts ?? {}).length;
    }, recoveryStorageKey)).toBe(1);

    await stopAfterCrash(firstApp);
    firstAppCrashed = true;
  } finally {
    if (!firstAppCrashed) {
      firstApp.process().kill('SIGKILL');
    }
  }

  const restartedApp = await launchApp(home, userData);
  try {
    const restartedMain = await restartedApp.firstWindow();
    await expect(restartedMain.locator('.cm-content')).toContainText(capturedText);
    await restartedMain.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => restartedMain.evaluate((key) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { drafts?: Record<string, unknown> };
      return Object.keys(stored.drafts ?? {}).length;
    }, recoveryStorageKey)).toBe(0);
  } finally {
    restartedApp.process().kill('SIGKILL');
  }
});
