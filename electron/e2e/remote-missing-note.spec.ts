import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';
import { HACKMD_NOTE_NOT_FOUND_MESSAGE } from '../../src/lib/note-errors';

const repoRoot = resolve(import.meta.dirname, '../..');

test('keeps a remote draft reachable when HackMD reports the note missing, ignoring the cached copy', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-remote-missing-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(defaultSettings));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Replace remote IPC only, so no credentials or network are needed.
    await app.evaluate(({ ipcMain }, { channels, settings, notFound }) => {
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
      let deleted = false;
      ipcMain.on('fixture:delete-note', () => { deleted = true; });
      replace(channels.settingsGet, () => ({
        ...settings, hasHackmdApiToken: true, hasAppearanceSettings: true,
        shouldShowHackmdOnboarding: false, hasLocalVault: false,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      }));
      replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
        id: 'fixture-user', name: 'Fixture', username: 'fixture', email: null, photo: null, teams: [], upgraded: false,
      } }));
      replace(channels.hackmdListTeams, () => ({ source: 'remote', data: [] }));
      replace(channels.hackmdListNotes, () => ({ source: 'remote', data: deleted ? [] : [note] }));
      // HackMD's 404 maps to the not-found message while the main-process cache still holds the old copy.
      replace(channels.hackmdGetNote, () => (deleted
        ? { source: 'error', error: notFound, data: note }
        : { source: 'remote', data: note }));
      for (const channel of [channels.hackmdListFolders, channels.hackmdListHistory]) {
        replace(channel, () => ({ source: 'remote', data: [] }));
      }
      replace(channels.hackmdGetFolderOrder, () => ({ source: 'remote', data: {} }));
    }, { channels: ELECTRON_CHANNELS, settings: defaultSettings, notFound: HACKMD_NOTE_NOT_FOUND_MESSAGE });
    await page.reload();

    await expect(page.locator('.cm-content')).toContainText('Saved remote body');
    await page.locator('.cm-content').fill('Unsaved remote edit');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hackdesk_note_workspace:personal') ?? '')).toContain('Unsaved remote edit');

    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      ipcMain.emit('fixture:delete-note');
      for (const window of BrowserWindow.getAllWindows()) window.webContents.session.flushStorageData();
    });
    await page.reload();

    await expect(page.getByRole('alert').filter({ hasText: 'The original note is no longer available.' })).toContainText(HACKMD_NOTE_NOT_FOUND_MESSAGE);
    await expect(page.getByRole('region', { name: 'Unsaved draft' })).toContainText('Unsaved remote edit');
    await expect(page.locator('.cm-content')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  } finally {
    app.process().kill('SIGKILL');
  }
});
