import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

test.skip(process.platform !== 'darwin', 'macOS activation policy is required');

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
