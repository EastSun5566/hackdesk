import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-existing-recovery-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Original.md'), '# Original\n\nSaved body');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  return { home, vault };
}

async function launch(home: string) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page };
}

async function crash(app: ElectronApplication) {
  if (app.process().exitCode !== null) return;
  const exited = new Promise<void>((done) => app.process().once('exit', () => done()));
  app.process().kill('SIGKILL');
  await exited;
}

async function waitForDraft(page: Page, text: string) {
  await expect.poll(() => page.evaluate((text) => {
    return Object.keys(localStorage).filter((key) => key.startsWith('hackdesk_note_workspace:local:'))
      .some((key) => Object.values(JSON.parse(localStorage.getItem(key) ?? '{}').drafts ?? {})
        .some((draft) => (draft as { content: string }).content === text));
  }, text)).toBe(true);
}

async function flushDiskStorage(app: ElectronApplication, home: string, page: Page) {
  // Flush Chromium's already-written DOM storage before simulating a process crash.
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.session.flushStorageData();
  });
  // flushStorageData initiates the write; wait for the current layout in Chromium's journal.
  const layouts = await page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith('hackdesk_note_workspace:local:'))
    .map((key) => localStorage.getItem(key)!));
  const directory = join(home, 'user-data', 'Local Storage', 'leveldb');
  await expect.poll(async () => {
    const files = await readdir(directory);
    const journals = await Promise.all(files.filter((file) => file.endsWith('.log')).map((file) => readFile(join(directory, file))));
    return layouts.length > 0 && layouts.every((layout) => journals.some((journal) => (
      journal.includes(Buffer.from(layout)) || journal.includes(Buffer.from(layout, 'utf16le'))
    )));
  }).toBe(true);
}

test('restores an existing note edit and edited title, then removes recovery only after saving', async () => {
  const { home, vault } = await fixture();
  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Saved body');
    await page.getByRole('textbox', { name: 'Note title' }).fill('Recovered title');
    await page.locator('.cm-content').fill('Recovered body');
    await waitForDraft(page, 'Recovered body');
    await flushDiskStorage(app, home, page);
    await crash(app);
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Recovered body');
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Recovered title');
    await expect(page.getByText('File changed on disk. Your draft is still open.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => readFile(join(vault, 'Recovered title.md'), 'utf8').catch(() => null)).toBe('Recovered body');
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith('hackdesk_note_workspace:local:'))
      .flatMap((key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? '{}').drafts ?? {})).length)).toBe(0);
    await flushDiskStorage(app, home, page);
    await crash(app);
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Recovered body');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute('aria-disabled', 'true');
  } finally { await crash(app); }
});

test('keeps both versions after a disk change, rejects overwrite through both Save paths, and saves a copy', async () => {
  const { home, vault } = await fixture();
  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Saved body');
    await page.locator('.cm-content').fill('Recovered draft');
    await waitForDraft(page, 'Recovered draft');
    await flushDiskStorage(app, home, page);
    await crash(app);
    await writeFile(join(vault, 'Original.md'), '# Original\n\nExternal edit');
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Recovered draft');
    await expect(page.getByText('File changed on disk. Your draft is still open.')).toBeVisible();
    await page.getByRole('button', { name: 'Compare with disk' }).click();
    const comparison = page.getByRole('dialog', { name: 'Compare with disk' });
    await expect(comparison.getByRole('region', { name: 'Your draft' })).toContainText('Recovered draft');
    await expect(comparison.getByRole('region', { name: 'On disk' })).toContainText('External edit');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('recovered-draft-comparison.png') });
    await page.keyboard.press('Escape');
    for (const save of ['shortcut', 'toolbar']) {
      if (save === 'shortcut') await page.keyboard.press(`${primary}+s`);
      else await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText(/file changed on disk/i).last()).toBeVisible();
      expect(await readFile(join(vault, 'Original.md'), 'utf8')).toContain('External edit');
      await expect(page.locator('.cm-content')).toContainText('Recovered draft');
    }
    await page.getByRole('button', { name: 'Save as copy', exact: true }).click();
    await expect.poll(() => readFile(join(vault, 'Original copy.md'), 'utf8').catch(() => null)).toBe('Recovered draft');
    expect(await readFile(join(vault, 'Original.md'), 'utf8')).toContain('External edit');
    await waitForDraft(page, 'Recovered draft');
  } finally { await crash(app); }
});

test('removes recovery when disk matches the draft and does not resurrect it on later disk edits', async () => {
  const { home, vault } = await fixture();
  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Saved body');
    await page.locator('.cm-content').fill('Matching body');
    await waitForDraft(page, 'Matching body');
    await flushDiskStorage(app, home, page);
    await crash(app);
    await writeFile(join(vault, 'Original.md'), 'Matching body');
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Matching body');
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith('hackdesk_note_workspace:local:'))
      .flatMap((key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? '{}').drafts ?? {})).length)).toBe(0);
    await flushDiskStorage(app, home, page);
    await crash(app);
    await writeFile(join(vault, 'Original.md'), 'Later disk edit');
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Later disk edit');
    await expect(page.getByText('File changed on disk. Your draft is still open.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute('aria-disabled', 'true');
  } finally { await crash(app); }
});

test('restores independent edits to two saved notes in dual panes', async () => {
  const { home, vault } = await fixture();
  await writeFile(join(vault, 'Second.md'), '# Second\n\nSecond saved body');
  let { app, page } = await launch(home);
  try {
    await page.getByRole('button', { name: 'Second', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('Second saved body');
    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('Saved body');
    await page.getByRole('button', { name: 'Pane actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Close Other Tabs', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('Saved body');
    await page.locator('.cm-content').fill('Left draft');
    await page.getByRole('button', { name: 'Pane actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Split Right', exact: true }).click();
    await page.getByRole('button', { name: 'Second', exact: true }).click();
    await expect(page.locator('.cm-content').last()).toContainText('Second saved body');
    await page.locator('.cm-content').last().fill('Right draft');
    await waitForDraft(page, 'Left draft');
    await waitForDraft(page, 'Right draft');
    await flushDiskStorage(app, home, page);
    await crash(app);
    ({ app, page } = await launch(home));
    await expect(page.getByRole('region', { name: /document pane/i })).toHaveCount(2);
    await expect(page.locator('.cm-content').first()).toContainText('Left draft');
    await expect(page.locator('.cm-content').last()).toContainText('Right draft');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('recovered-dual-panes.png') });
  } finally { await crash(app); }
});
