import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';
import { cancelFolderPicker, chooseFolderInPicker } from './fixtures/folder-picker';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch(home: string) {
  const env: Record<string, string> = { ...definedEnvironment(process.env), HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`, '--quick-capture'], cwd: repoRoot, env });
  await expect.poll(() => app.windows().some((page) => page.url().includes('#/electron'))).toBe(true);
  const page = app.windows().find((candidate) => candidate.url().includes('#/electron'))!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page, appProcess: app.process() };
}

async function stop(app: ElectronApplication) {
  if (app.process().exitCode !== null) return;
  const exited = new Promise<void>((done) => app.process().once('exit', () => done()));
  app.process().kill('SIGKILL');
  await exited;
}

async function captureDraft(app: ElectronApplication, page: Page, text: string) {
  const popup = app.windows().find((candidate) => candidate.url().includes('#/quick-capture'))!;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/quick-capture'))?.show());
  await popup.getByLabel('Quick Hack note').fill(text);
  await popup.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText(text);
}

async function openVaultSettings(page: Page) {
  await page.keyboard.press(`${primary}+,`);
  await page.getByRole('tab', { name: 'Vault', exact: true }).click();
}

async function choose(page: Page, path: string | null, homeBase: string) {
  // The in-app picker opens instead of the native dialog. Real IPC, settings, scan and vault
  // identity are exercised; only the native dialog is replaced. The picker starts at the
  // current vault, so climb to the shared parent before descending into the target.
  await page.getByRole('button', { name: 'Add Folder', exact: true }).click();
  if (!path) {
    await cancelFolderPicker(page);
    return;
  }
  await chooseFolderInPicker(page, basename(path), homeBase);
  // The open folder card and the folder list both name the path.
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText(path, { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
}

test('two real vaults preserve tabs, dual panes, draft input, finder and folders across switching, cancel, Forget and restart', async () => {
  test.setTimeout(120_000);
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-vault-workspace-'));
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(join(home, 'A', 'A folder'), { recursive: true });
  await mkdir(join(home, 'B'));
  // The picker resolves symlinks (/var → /private/var on macOS), so compare canonical paths.
  const vaultA = await realpath(join(home, 'A'));
  const vaultB = await realpath(join(home, 'B'));
  await writeFile(join(vaultA, 'A folder', 'A note.md'), '# A note\n\nOnly in A.');
  await writeFile(join(vaultB, 'B note.md'), '# B note\n\nOnly in B.');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({ ...defaultSettings, localVault: { vaults: [{ id: 'vault-a', path: vaultA }], activeVaultId: 'vault-a' }, onboarding: { hackmdTokenSetupDeferred: true } }));
  let { app, page, appProcess } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    await page.getByRole('button', { name: 'Collapse A folder', exact: true }).click();
    await captureDraft(app, page, 'Draft A');
    await page.locator('.cm-content').fill('Draft A — latest input');
    await page.getByRole('button', { name: 'Pane actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Split Right', exact: true }).click();
    await expect(page.locator('[data-active-pane]')).toHaveCount(2);
    await page.getByRole('textbox', { name: 'Search notes' }).fill('A search');
    await openVaultSettings(page);
    await choose(page, null, basename(home));
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await openVaultSettings(page);
    await choose(page, vaultB, basename(home));
    await expect(page.locator('.cm-content')).toContainText('Only in B.');
    await expect(page.getByRole('textbox', { name: 'Search notes' })).toHaveValue('');
    await expect(page.locator('[data-active-pane]')).toHaveCount(1);
    await captureDraft(app, page, 'Draft B');
    await openVaultSettings(page);
    await choose(page, vaultA, basename(home));
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await expect(page.locator('[data-active-pane]')).toHaveCount(2);
    await expect(page.getByRole('textbox', { name: 'Search notes' })).toHaveValue('A search');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('');
    await expect(page.getByRole('button', { name: 'Expand A folder', exact: true })).toBeVisible();
    await openVaultSettings(page);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' });
    await settingsDialog.locator('li', { hasText: vaultA }).getByRole('button', { name: 'Forget', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget Vault', exact: true }).click();
    // Forgetting the active vault falls back to the other known vault; forgetting again empties the list.
    // The fallback briefly keeps the old panes while the new vault loads, then settles on its tabs.
    await expect(page.locator('[data-active-pane]')).toHaveCount(1);
    await expect(page.locator('.cm-content')).toContainText('Draft B');
    await openVaultSettings(page);
    await settingsDialog.locator('li', { hasText: vaultB }).getByRole('button', { name: 'Forget', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Forget Vault', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('No folders added yet.', { exact: true })).toBeVisible();
    await choose(page, vaultA, basename(home));
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/electron'));
      main?.show(); main?.focus();
    });
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('vault-A-restored.png') });
    // A pane below the right one makes an L, which comes back after the restart too.
    await page.getByRole('button', { name: 'Pane actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Split Down', exact: true }).click();
    await expect(page.locator('[data-active-pane]')).toHaveCount(3);
    // The workspace saves shortly after a change; wait for the three panes to be written.
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('hackdesk_note_workspace:'))
      .some(key => (JSON.parse(localStorage.getItem(key) ?? '{}').panes ?? []).length === 3))).toBe(true);
    // Exercise a normal restart; flushStorageData has no completion signal before SIGKILL.
    await app.evaluate(({ app: electronApp }) => {
      setImmediate(() => electronApp.quit());
    });
    const closeHackDesk = page.getByRole('alertdialog');
    if (await closeHackDesk.isVisible().catch(() => false)) {
      await closeHackDesk.getByRole('button', { name: 'Close' }).click();
    }
    await expect.poll(() => appProcess.exitCode).toBe(0);
    ({ app, page, appProcess } = await launch(home));
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await expect(page.locator('[data-active-pane]')).toHaveCount(3);
    const columns = await page.locator('[data-active-pane]').evaluateAll(elements => new Set(elements.map(element => Math.round(element.getBoundingClientRect().x))).size);
    expect(columns).toBe(2);
    await openVaultSettings(page);
    await choose(page, vaultB, basename(home));
    await expect(page.locator('.cm-content')).toContainText('Draft B');
    // The workspace switcher lists each vault by folder name and switches between them.
    await page.getByRole('button', { name: /^Switch workspace, current: / }).click();
    await page.getByRole('dialog', { name: 'Workspaces' }).getByRole('button', { name: 'A', exact: true }).click();
    await expect(page.locator('.cm-content').first()).toContainText('Only in A.');
    await expect(page.getByRole('button', { name: /^Switch workspace, current: A/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Switch workspace, current: A/ })).toBeVisible();
    await openVaultSettings(page);
    await choose(page, vaultB, basename(home));
    await expect(page.locator('.cm-content')).toContainText('Draft B');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/electron'))?.show());
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('vault-B-restored.png') });
  } finally { if (appProcess.exitCode === null) await stop(app); }
});

test('Quick Hack rejects capture during the in-app folder picker and keeps popup text', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-vault-capture-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({ ...defaultSettings, localVault: { vaults: [{ id: 'vault-e2e', path: vault }], activeVaultId: 'vault-e2e' }, onboarding: { hackmdTokenSetupDeferred: true } }));
  const { app, page } = await launch(home);
  try {
    await expect(page.getByRole('button', { name: /^Switch workspace, current: / })).toBeVisible();
    await openVaultSettings(page);
    await page.getByRole('button', { name: 'Add Folder', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a Vault Folder' });
    await expect(picker).toBeVisible();
    const popup = app.windows().find((candidate) => candidate.url().includes('#/quick-capture'))!;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/quick-capture'))?.show());
    await popup.getByLabel('Quick Hack note').fill('Keep this text during switching');
    await popup.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(popup.getByText('Local Vault is still loading. Your text is still here.')).toBeVisible();
    await expect(popup.getByLabel('Quick Hack note')).toHaveValue('Keep this text during switching');
    await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally { await stop(app); }
});
