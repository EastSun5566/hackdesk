import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { definedEnvironment } from './fixtures/environment';
import { cancelFolderPicker, chooseFolderInPicker } from './fixtures/folder-picker';
import { ELECTRON_CHANNELS } from '../src/shared/channels';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const initialKey = 'hackdesk_note_workspace:initial-drafts';

async function launch(home: string) {
  const env: Record<string, string> = { ...definedEnvironment(process.env), HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => localStorage.setItem('hackdesk_new_tab_opens', 'duplicate'));
  return { app, page };
}

async function quit(app: ElectronApplication, page: Page) {
  const process = app.process();
  await app.evaluate(({ app, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    setImmediate(() => app.quit());
  });
  const closeHackDesk = page.getByRole('alertdialog');
  // Both callers have unsaved drafts; wait for the renderer's asynchronous confirmation.
  await expect(closeHackDesk).toBeVisible();
  await closeHackDesk.getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => process.exitCode).toBe(0);
}

test('quits a fresh install without asking when its first draft is still empty', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-empty-draft-'));
  const { app, page } = await launch(home);
  // Held before quitting: the app's handle can't be asked for its process once it has exited.
  const child = app.process();
  try {
    await expect(page.locator('.cm-content')).toBeFocused();
    await expect(page.getByRole('tab')).toHaveCount(1);
    const exited = new Promise<'exited'>(resolveExit => child.once('exit', () => resolveExit('exited')));
    await app.evaluate(({ app }) => { setImmediate(() => app.quit()); });
    // Nothing was typed, so nothing is kept and there is nothing to confirm.
    const outcome = await Promise.race([
      exited,
      page.getByRole('alertdialog').waitFor({ state: 'visible', timeout: 15_000 }).then(
        () => 'confirmation' as const,
        () => 'closed' as const,
      ),
    ]);
    expect(outcome).not.toBe('confirmation');
    await exited;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

test('starts without setup, preserves drafts through cancel/restart, and saves only the chosen draft to a real vault', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-first-draft-'));
  const vault = join(home, 'vault');
  await mkdir(vault);
  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.cm-content').fill('# First draft\n\nLatest first input');
    await page.keyboard.press(`${primary}+n`);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.locator('.cm-content').fill('# Second draft\n\nKeep this unsaved');
    await quit(app, page);
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Keep this unsaved');
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('tab').first().click();
    await page.keyboard.press(`${primary}+s`);
    await expect(page.getByRole('dialog', { name: 'Save note', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-content')).toBeFocused();
    await expect(page.locator('.cm-content')).toContainText('Latest first input');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
    await cancelFolderPicker(page);
    await expect(page.locator('.cm-content')).toBeFocused();
    expect(await readdir(vault)).toEqual([]);
    
    await page.keyboard.press(`${primary}+s`);
    await page.getByRole('button', { name: 'Local Vault', exact: true }).click();
    await chooseFolderInPicker(app, page, 'vault');
    await expect.poll(async () => (await readdir(vault)).filter(name => name.endsWith('.md'))).toHaveLength(1);
    const file = (await readdir(vault)).find(name => name.endsWith('.md'))!;
    expect(await readFile(join(vault, file), 'utf8')).toContain('Latest first input');
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect.poll(() => page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key) ?? '{}').tabs ?? {}).length, initialKey)).toBe(0);
    await page.getByRole('tab').last().click();
    await expect(page.locator('.cm-content')).toContainText('Keep this unsaved');
    await quit(app, page);
    ({ app, page } = await launch(home));
    await expect(page.locator('.cm-content')).toContainText('Keep this unsaved');
    expect((await readdir(vault)).filter(name => name.endsWith('.md'))).toHaveLength(1);
    await page.keyboard.press(`${primary}+,`);
    for (const name of ['AI (Experimental)', 'Dictation (Experimental)']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    expect(await page.getByLabel('Settings sidebar', { exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('experimental-settings.png'), animations: 'disabled' });
  } finally {
    if (app.process().exitCode === null) app.process().kill('SIGKILL');
  }
});

test('HackMD setup failure keeps text and successful setup saves one draft through synthetic IPC only', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-first-hackmd-'));
  const { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toBeFocused();
    await page.locator('.cm-content').fill('# Remote draft\n\nKeep the whole draft');
    const storedSettings = await page.evaluate(() => window.hackdeskAPI!.settings.get());
    await app.evaluate(({ ipcMain, session }, { channels, settings }) => {
      // No remote service or real credential is used by this fixture.
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
      const replace = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
        ipcMain.removeHandler(channel); ipcMain.handle(channel, handler);
      };
      const state = { attempts: 0, created: [] as { title: string; content: string }[] };
      Object.assign(globalThis, { firstDraftFixture: state });
      replace(channels.hackmdValidateToken, () => {
        if (++state.attempts === 1) throw new Error('Fixture connection failed');
        return { id: 'fixture', name: 'Demo User' };
      });
      replace(channels.settingsUpdate, () => ({ ...settings, hasHackmdApiToken: true, shouldShowHackmdOnboarding: false }));
      replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: { id: 'fixture', name: 'Demo User', username: 'demo', teams: [] } }));
      for (const channel of [channels.hackmdListNotes, channels.hackmdListFolders, channels.hackmdListTeams, channels.hackmdListHistory]) replace(channel, () => ({ source: 'remote', data: [] }));
      replace(channels.hackmdGetFolderOrder, () => ({ source: 'remote', data: {} }));
      const note = {
        id: 'fixture-note', shortId: 'fixture-note', teamPath: null,
        folderPaths: [], tags: [], description: '', permalink: null, publishLink: null,
        createdAtMillis: null, updatedAtMillis: null, publishedAtMillis: null,
        tagsUpdatedAtMillis: null, titleUpdatedAtMillis: null, lastChangeUser: null,
        readPermission: 'owner', writePermission: 'owner', userPath: null, publishType: 'edit',
      };
      replace(channels.hackmdCreateNote, (_event, input) => {
        state.created.push(input);
        return { ...note, title: input.title, content: input.content };
      });
      replace(channels.hackmdGetNote, () => ({ source: 'remote', data: { ...note, title: state.created[0]?.title, content: state.created[0]?.content } }));
    }, { channels: ELECTRON_CHANNELS, settings: storedSettings });
    await page.keyboard.press(`${primary}+s`);
    await page.getByRole('button', { name: 'HackMD', exact: true }).click();
    await page.getByLabel('HackMD API Token', { exact: true }).fill('synthetic-test-token');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText(/Fixture connection failed/)).toBeVisible();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Connect HackMD' })).toBeHidden();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { firstDraftFixture: { created: unknown[] } }).firstDraftFixture.created.length)).toBe(1);
    await expect(page.locator('.cm-content')).toContainText('Keep the whole draft');
    await page.screenshot({ path: test.info().outputPath('first-note-saved.png'), animations: 'disabled' });
  } finally {
    if (app.process().exitCode === null) app.process().kill('SIGKILL');
  }
});
