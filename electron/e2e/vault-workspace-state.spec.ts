import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch(home: string) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`, '--quick-capture'], cwd: repoRoot, env });
  await expect.poll(() => app.windows().some((page) => page.url().includes('#/electron'))).toBe(true);
  const page = app.windows().find((candidate) => candidate.url().includes('#/electron'))!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page };
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

async function choose(app: ElectronApplication, page: Page, path: string | null) {
  // Mock only the native picker. Real IPC, settings, scan and vault identity are exercised.
  await app.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: !selected, filePaths: selected ? [selected] : [] });
  }, path);
  await page.getByRole('button', { name: 'Change Vault', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change Vault', exact: true })).toBeEnabled();
  if (path) await expect(page.getByRole('dialog', { name: 'Settings' }).getByText(path, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
}

test('two real vaults preserve tabs, dual panes, draft input, finder and folders across switching, cancel, Forget and restart', async () => {
  test.setTimeout(120_000);
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-vault-workspace-'));
  const vaultA = join(home, 'A');
  const vaultB = join(home, 'B');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(join(vaultA, 'A folder'), { recursive: true });
  await mkdir(vaultB);
  await writeFile(join(vaultA, 'A folder', 'A note.md'), '# A note\n\nOnly in A.');
  await writeFile(join(vaultB, 'B note.md'), '# B note\n\nOnly in B.');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({ ...defaultSettings, localVault: { path: vaultA }, onboarding: { hackmdTokenSetupDeferred: true } }));
  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    await page.getByRole('button', { name: 'Collapse A folder', exact: true }).click();
    await captureDraft(app, page, 'Draft A');
    await page.locator('.cm-content').fill('Draft A — latest input');
    await page.getByRole('button', { name: 'Pane actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Split Right', exact: true }).click();
    await expect(page.getByRole('region', { name: /document pane/i })).toHaveCount(2);
    await page.getByRole('textbox', { name: 'Search notes' }).fill('A search');
    await openVaultSettings(page);
    await choose(app, page, null);
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await openVaultSettings(page);
    await choose(app, page, vaultB);
    await expect(page.locator('.cm-content')).toContainText('Only in B.');
    await expect(page.getByRole('textbox', { name: 'Search notes' })).toHaveValue('');
    await expect(page.getByRole('region', { name: /document pane/i })).toHaveCount(1);
    await captureDraft(app, page, 'Draft B');
    await openVaultSettings(page);
    await choose(app, page, vaultA);
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await expect(page.getByRole('region', { name: /document pane/i })).toHaveCount(2);
    await expect(page.getByRole('textbox', { name: 'Search notes' })).toHaveValue('A search');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('');
    await expect(page.getByRole('button', { name: 'Expand A folder', exact: true })).toBeVisible();
    await openVaultSettings(page);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    await page.getByRole('button', { name: 'Forget Vault', exact: true }).click();
    await expect(page.getByText('No local vault configured', { exact: true })).toBeVisible();
    await choose(app, page, vaultA);
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/electron'));
      main?.show(); main?.focus();
    });
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('vault-A-restored.png') });
    // Commit Chromium's DOM storage to disk before simulating a process crash.
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.session.flushStorageData();
    });
    await stop(app);
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content').last()).toContainText('Draft A — latest input');
    await expect(page.getByRole('region', { name: /document pane/i })).toHaveCount(2);
    await openVaultSettings(page);
    await choose(app, page, vaultB);
    await expect(page.locator('.cm-content')).toContainText('Draft B');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/electron'))?.show());
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('vault-B-restored.png') });
  } finally { await stop(app); }
});

test('Quick Hack rejects capture during a native vault picker and keeps popup text', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-vault-capture-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({ ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true } }));
  const { app, page } = await launch(home);
  try {
    await expect(page.getByRole('button', { name: 'Local Vault', exact: true })).toBeVisible();
    await openVaultSettings(page);
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = () => new Promise((resolvePicker) => {
        (globalThis as unknown as { cancelVaultPicker: () => void }).cancelVaultPicker = () => resolvePicker({ canceled: true, filePaths: [] });
      });
    });
    await page.getByRole('button', { name: 'Change Vault', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Change Vault', exact: true })).toBeDisabled();
    const popup = app.windows().find((candidate) => candidate.url().includes('#/quick-capture'))!;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('#/quick-capture'))?.show());
    await popup.getByLabel('Quick Hack note').fill('Keep this text during switching');
    await popup.getByRole('button', { name: 'Capture', exact: true }).click();
    await expect(popup.getByText('Local Vault is still loading. Your text is still here.')).toBeVisible();
    await expect(popup.getByLabel('Quick Hack note')).toHaveValue('Keep this text during switching');
    await app.evaluate(() => (globalThis as unknown as { cancelVaultPicker: () => void }).cancelVaultPicker());
  } finally { await stop(app); }
});
