import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

test('does not save over a note changed on HackMD and keeps the draft recoverable', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-remote-conflict-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(defaultSettings));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const child = app.process();
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Replace remote IPC only, so no credentials or network are needed.
    await app.evaluate(({ ipcMain }, { channels, settings }) => {
      const replace = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
      };
      const note = {
        id: 'remote-note', shortId: 'remote-note', title: 'Remote', content: 'Saved remote body', teamPath: null,
        tags: [], description: '', permalink: null, publishLink: 'https://hackmd.io/remote-note', folderPaths: [],
        readPermission: 'owner', writePermission: 'owner', createdAtMillis: null, updatedAtMillis: 1,
        lastChangeUser: null, publishedAtMillis: null, publishType: 'edit', tagsUpdatedAtMillis: null,
        titleUpdatedAtMillis: null, userPath: null,
      };
      const fixture = { writes: 0 };
      (globalThis as { remoteConflictFixture?: typeof fixture }).remoteConflictFixture = fixture;
      ipcMain.on('fixture:change-remote', () => { note.content = 'Changed on HackMD'; note.updatedAtMillis = 2; });
      replace(channels.settingsGet, () => ({
        ...settings, hasHackmdApiToken: true, hasAppearanceSettings: true,
        shouldShowHackmdOnboarding: false, hasLocalVault: false,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      }));
      replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
        id: 'fixture-user', name: 'Fixture', username: 'fixture', email: null, photo: null, teams: [], upgraded: false,
      } }));
      replace(channels.hackmdListTeams, () => ({ source: 'remote', data: [] }));
      replace(channels.hackmdListNotes, () => ({ source: 'remote', data: [{ ...note }] }));
      replace(channels.hackmdGetNote, () => ({ source: 'remote', data: { ...note } }));
      replace(channels.hackmdUpdateNote, () => {
        fixture.writes += 1;
        return { ...note };
      });
      for (const channel of [channels.hackmdListFolders, channels.hackmdListHistory]) {
        replace(channel, () => ({ source: 'remote', data: [] }));
      }
      replace(channels.hackmdGetFolderOrder, () => ({ source: 'remote', data: {} }));
    }, { channels: ELECTRON_CHANNELS, settings: defaultSettings });
    await page.reload();

    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Saved remote body');
    await editor.fill('My local edit');
    await app.evaluate(({ ipcMain }) => { ipcMain.emit('fixture:change-remote'); });
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('This note changed on HackMD. Your draft is still open.')).toBeVisible();
    await expect(editor).toContainText('My local edit');
    expect(await app.evaluate(() => (globalThis as { remoteConflictFixture?: { writes: number } }).remoteConflictFixture?.writes)).toBe(0);

    await page.getByRole('button', { name: 'Compare with HackMD' }).click();
    const dialog = page.getByRole('dialog', { name: 'Compare with HackMD' });
    await expect(dialog.getByRole('region', { name: 'Your draft' })).toContainText('My local edit');
    await expect(dialog.getByRole('region', { name: 'On HackMD' })).toContainText('Changed on HackMD');
    await page.keyboard.press('Escape');

    // The draft can be kept as a new note, leaving the original untouched.
    await page.getByRole('button', { name: 'Open as new draft' }).click();
    await expect(editor).toContainText('My local edit');
    await expect(page.getByText('This note changed on HackMD. Your draft is still open.')).toHaveCount(0);
    // Both tabs are titled Remote; return to the original one.
    await page.locator('[role="tab"][aria-label="Select Remote tab"][aria-selected="false"]').click();

    await page.getByRole('button', { name: 'Reload from HackMD' }).click();
    await expect(editor).toContainText('Changed on HackMD');
    await expect(page.getByText('This note changed on HackMD. Your draft is still open.')).toHaveCount(0);
    expect(await app.evaluate(() => (globalThis as { remoteConflictFixture?: { writes: number } }).remoteConflictFixture?.writes)).toBe(0);
  } finally {
    child.kill('SIGKILL');
  }
});
