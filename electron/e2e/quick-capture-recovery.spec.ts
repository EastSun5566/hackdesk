import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BaseWindow, MessageBoxOptions } from 'electron';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

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

test('recovers an accepted Quick Hack after restart and clears recovery after save', async () => {
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
  let recoveryStorageKey = '';
  try {
    await expect.poll(() => firstApp.windows().map((page) => page.url())).toEqual(expect.arrayContaining([
      expect.stringContaining('#/electron'),
      expect.stringContaining('#/quick-capture'),
    ]));
    const firstMain = firstApp.windows().find((page) => page.url().includes('#/electron'))!;
    const quickCapture = firstApp.windows().find((page) => page.url().includes('#/quick-capture'))!;

    await expect(firstMain.getByText('Local Vault', { exact: true }).first()).toBeVisible();
    await quickCapture.getByLabel('Quick Hack note').fill(capturedText);
    await quickCapture.getByRole('button', { name: 'Capture' }).click();
    await expect(firstMain.locator('.cm-content')).toContainText(capturedText);
    recoveryStorageKey = await firstMain.evaluate(async () => {
      const snapshot = await window.hackdeskAPI!.localVault.getSnapshot();
      return `hackdesk_note_workspace:local:${snapshot!.vaultId}`;
    });
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

test('renderer recovery targets the failing window and keeps Quick Hack text on its route', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-window-recovery-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await launchApp(home, join(home, 'user-data'), true);
  try {
    await expect.poll(() => app.windows().map(page => page.url())).toEqual(expect.arrayContaining([
      expect.stringContaining('#/electron'), expect.stringContaining('#/quick-capture'),
    ]));
    const main = app.windows().find(page => page.url().includes('#/electron'))!;
    const capture = app.windows().find(page => page.url().includes('#/quick-capture'))!;
    await expect(main.getByText('Local Vault', { exact: true }).first()).toBeVisible();
    await capture.getByLabel('Quick Hack note').fill('Recover this Quick Hack');
    await expect.poll(() => capture.evaluate(() => JSON.parse(localStorage.getItem('hackdesk_quick_capture_buffer') ?? 'null')?.content)).toBe('Recover this Quick Hack');

    const ids = await app.evaluate(({ BrowserWindow, dialog }) => {
      const calls: { windowId: number; message: string }[] = [];
      Object.assign(globalThis, { recoveryCalls: calls });
      // Answer real recovery dialogs automatically, recording their native parent.
      Object.assign(dialog, { showMessageBox: async (window: BaseWindow, options: MessageBoxOptions) => {
        calls.push({ windowId: window.id, message: options.message });
        return { response: 0, checkboxChecked: false };
      } });
      return BrowserWindow.getAllWindows().map(window => ({ id: window.id, url: window.webContents.getURL() }));
    });
    const mainId = ids.find(window => window.url.includes('#/electron'))!.id;
    const captureId = ids.find(window => window.url.includes('#/quick-capture'))!.id;
    const recoveryCalls = () => app.evaluate(() => (globalThis as typeof globalThis & {
      recoveryCalls: { windowId: number; message: string }[];
    }).recoveryCalls);
    // Playwright's Page remains marked crashed; inspect the recovered renderer through Electron.
    const rendererState = (id: number) => app.evaluate(({ BrowserWindow }, id) => (
      BrowserWindow.fromId(id)!.webContents.executeJavaScript('({ url: location.href, text: document.body.textContent, input: document.querySelector("textarea")?.value ?? null })')
    ), id);

    await app.evaluate(({ BrowserWindow }, { mainId, captureId }) => new Promise<void>(resolve => {
      const window = BrowserWindow.fromId(mainId)!;
      window.webContents.once('did-finish-load', () => resolve());
      BrowserWindow.fromId(captureId)!.focus();
      window.webContents.forcefullyCrashRenderer();
    }), { mainId, captureId });
    await expect.poll(recoveryCalls).toEqual([{ windowId: mainId, message: 'HackDesk renderer stopped' }]);
    await expect.poll(async () => (await rendererState(mainId)).text).toContain('Local Vault');
    await expect(capture).toHaveURL(/#\/quick-capture$/);
    await expect(capture.getByLabel('Quick Hack note')).toHaveValue('Recover this Quick Hack');

    await app.evaluate(({ BrowserWindow }, { mainId, captureId }) => new Promise<void>(resolve => {
      const window = BrowserWindow.fromId(captureId)!;
      window.webContents.once('did-finish-load', () => resolve());
      BrowserWindow.fromId(mainId)!.focus();
      window.webContents.forcefullyCrashRenderer();
    }), { mainId, captureId });
    await expect.poll(recoveryCalls).toEqual([
      { windowId: mainId, message: 'HackDesk renderer stopped' },
      { windowId: captureId, message: 'Quick Hack renderer stopped' },
    ]);
    await expect.poll(() => rendererState(captureId)).toMatchObject({
      url: expect.stringMatching(/#\/quick-capture$/), input: 'Recover this Quick Hack',
    });
    expect((await rendererState(mainId)).url).toMatch(/#\/electron$/);
  } finally {
    await stopAfterCrash(app);
  }
});
