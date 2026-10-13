import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

test.skip(process.platform !== 'darwin', 'macOS activation policy is required');

async function launchQuickHackFixture() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-lifecycle-'));
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    onboarding: { hackmdTokenSetupDeferred: true },
  }));
  // Capture the real registered callback before startup, without changing product APIs.
  // Calling it verifies app behavior, not delivery of a macOS global key event.
  const bootstrap = join(home, 'lifecycle.cjs');
  await writeFile(bootstrap, `
    const { app, globalShortcut } = require('electron');
    app.setAppPath(${JSON.stringify(repoRoot)});
    const register = globalShortcut.register.bind(globalShortcut);
    globalShortcut.register = (accelerator, callback) => {
      if (accelerator === 'Control+Alt+H') globalThis.openQuickHack = callback;
      return register(accelerator, callback);
    };
    require(${JSON.stringify(join(repoRoot, 'electron/dist/main.cjs'))});
  `);
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  return electron.launch({
    args: [bootstrap, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`],
    cwd: repoRoot,
    env,
  });
}

async function openQuickHackFromMain(app: ElectronApplication) {
  const main = await app.firstWindow();
  await expect(main.getByRole('heading', { name: 'No note selected' })).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused())).toBe(true);
  const popupPromise = app.waitForEvent('window');
  await app.evaluate(() => {
    const open = (globalThis as typeof globalThis & { openQuickHack?: () => void }).openQuickHack;
    if (!open) throw new Error('Quick Hack callback was not registered');
    open();
  });
  const popup = await popupPromise;
  await expect(popup.getByLabel('Quick Hack note')).toBeVisible();
  return { main, popup };
}

test('Close Window enters background mode, activation restores the app, and Quit exits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-lifecycle-'));
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    onboarding: { hackmdTokenSetupDeferred: true },
  }));

  const app = await electron.launch({
    args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`],
    cwd: repoRoot,
    env: { ...process.env, HOME: home },
  });
  const appProcess = app.process();

  try {
    const main = await app.firstWindow();
    await expect(main.getByRole('heading', { name: 'No note selected' })).toBeVisible();
    expect(await app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible())).toBe(true);

    await app.evaluate(({ Menu }) => {
      const fileMenu = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File');
      const closeWindow = fileMenu?.submenu?.items.find((item) => item.label === 'Close Window');
      if (!closeWindow?.click) {
        throw new Error('Close Window menu item is missing');
      }
      closeWindow.click(closeWindow, undefined, {} as Electron.KeyboardEvent);
    });
    await expect.poll(() => app.windows().length).toBe(0);
    await expect.poll(() => app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible())).toBe(false);
    expect(appProcess.exitCode).toBeNull();

    const reopenedPromise = app.waitForEvent('window');
    await app.evaluate(({ app: electronApp }) => electronApp.emit('activate'));
    const reopened = await reopenedPromise;
    await expect(reopened.getByRole('heading', { name: 'No note selected' })).toBeVisible();
    expect(await app.evaluate(({ app: electronApp }) => electronApp.dock?.isVisible())).toBe(true);

    await app.evaluate(({ app: electronApp }) => {
      setImmediate(() => electronApp.quit());
    });
    await expect.poll(() => appProcess.exitCode).toBe(0);
  } finally {
    if (appProcess.exitCode === null) {
      appProcess.kill('SIGKILL');
    }
  }
});

test('canceling Quick Hack returns focus to main and preserves the capture buffer', async () => {
  const app = await launchQuickHackFixture();
  try {
    const { main, popup } = await openQuickHackFromMain(app);
    await popup.getByLabel('Quick Hack note').fill('Keep this canceled capture');
    await expect.poll(() => popup.evaluate(() => JSON.parse(localStorage.getItem('hackdesk_quick_capture_buffer') ?? 'null')?.content)).toBe('Keep this canceled capture');
    await popup.keyboard.press('Escape');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return {
        mainFocused: windows.find(window => window.webContents.getURL().includes('#/electron'))?.isFocused(),
        popupVisible: windows.find(window => window.webContents.getURL().includes('#/quick-capture'))?.isVisible(),
      };
    })).toEqual({ mainFocused: true, popupVisible: false });
    await expect(main.getByRole('heading', { name: 'No note selected' })).toBeVisible();
    expect(await popup.evaluate(() => JSON.parse(localStorage.getItem('hackdesk_quick_capture_buffer') ?? 'null')?.content)).toBe('Keep this canceled capture');
    expect(app.process().exitCode).toBeNull();
  } finally {
    if (app.process().exitCode === null) app.process().kill('SIGKILL');
  }
});

test('Cmd+Q from Quick Hack exits the whole app', async () => {
  const app = await launchQuickHackFixture();
  const appProcess = app.process();
  try {
    await openQuickHackFromMain(app);
    // Exercise Electron's native before-input-event handler, not OS key delivery.
    await app.evaluate(({ BrowserWindow }) => {
      const popup = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#/quick-capture'))!;
      popup.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Q', modifiers: ['meta'] });
    });
    await expect.poll(() => appProcess.exitCode).toBe(0);
  } finally {
    if (appProcess.exitCode === null) appProcess.kill('SIGKILL');
  }
});
