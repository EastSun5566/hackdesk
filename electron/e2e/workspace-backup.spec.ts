import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

test('keeps drafts when workspace backup fails, rejects Quick Hack and clears after retry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-smoke-'));
  const userData = join(home, 'user-data');
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault, { recursive: true });
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { path: vault },
  }));

  const app = await electron.launch({
    args: [repoRoot, `--user-data-dir=${userData}`, `--hackdesk-home=${home}`, '--quick-capture'],
    cwd: repoRoot,
    env: { ...process.env, HOME: home },
  });
  try {
    await expect.poll(() => app.windows().map((page) => page.url())).toEqual(expect.arrayContaining([
      expect.stringContaining('#/electron'),
      expect.stringContaining('#/quick-capture'),
    ]));
    const main = app.windows().find((page) => page.url().includes('#/electron'))!;
    const quickCapture = app.windows().find((page) => page.url().includes('#/quick-capture'))!;
    await expect(main.getByText('Local Vault', { exact: true }).first()).toBeVisible();

    await quickCapture.getByLabel('Quick Hack note').fill('Backed up capture');
    await quickCapture.getByRole('button', { name: 'Capture' }).click();
    await expect(main.locator('.cm-content')).toContainText('Backed up capture');
    const storageKey = await main.evaluate(async () => {
      const snapshot = await window.hackdeskAPI!.localVault.getSnapshot();
      return `hackdesk_note_workspace:local:${snapshot!.vaultId}`;
    });
    const readBackup = () => main.evaluate((key) => localStorage.getItem(key) ?? '', storageKey);
    await expect.poll(readBackup).toContain('Backed up capture');

    // Simulate a full storage quota in the main window only.
    await main.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
    });
    await main.locator('.cm-content').click();
    await main.keyboard.press('End');
    await main.keyboard.type(' plus memory-only edit');
    const notice = main.getByRole('alert').filter({ hasText: 'Workspace backup failed' });
    await expect(notice).toBeVisible();
    expect(await readBackup()).not.toContain('memory-only edit');

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/quick-capture'))?.show();
    });
    await quickCapture.getByLabel('Quick Hack note').fill('Rejected capture');
    await quickCapture.getByRole('button', { name: 'Capture' }).click();
    await expect(quickCapture.getByRole('alert')).toContainText('Your text is still here');
    await expect(quickCapture.getByLabel('Quick Hack note')).toHaveValue('Rejected capture');
    await expect(main.locator('.cm-content')).not.toContainText('Rejected capture');

    await notice.getByRole('button', { name: 'Copy draft' }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toContain('memory-only edit');

    await notice.getByRole('button', { name: 'Retry backup' }).click();
    await expect(notice).toBeVisible();
    await main.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
    await notice.getByRole('button', { name: 'Retry backup' }).click();
    await expect(notice).toBeHidden();
    await expect.poll(readBackup).toContain('memory-only edit');
  } finally {
    app.process().kill('SIGKILL');
  }
});
