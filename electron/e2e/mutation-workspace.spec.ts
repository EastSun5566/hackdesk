import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

for (const origin of ['personal', 'team-a']) {
  test(`delayed ${origin} create and save preserve the originating draft and leave Team B alone`, async () => {
    const home = await mkdtemp(join(tmpdir(), 'hackdesk-mutation-'));
    await mkdir(join(home, '.hackdesk'));
    await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(defaultSettings));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
    const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
    try {
      const page = await app.firstWindow();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Replace remote IPC only. Real renderer mutations, cache, workspace
      // switching and persistence run without credentials or network access.
      await app.evaluate(({ ipcMain }, { channels, settings }) => {
        const replace = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, handler);
        };
        replace(channels.settingsGet, () => ({
          ...settings, hasHackmdApiToken: true, hasAppearanceSettings: true,
          shouldShowHackmdOnboarding: false, hasLocalVault: false,
          hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        }));
        replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
          id: 'fixture-user', name: 'Fixture', username: 'fixture', email: null, photo: null, teams: [], upgraded: false,
        } }));
        replace(channels.hackmdListTeams, () => ({ source: 'remote', data: ['a', 'b'].map((id) => ({
          id: `team-${id}`, path: `team-${id}`, name: `Team ${id.toUpperCase()}`, ownerId: null,
          visibility: 'private', logo: null, description: null, createdAtMillis: null, upgraded: false,
        })) }));
        let note = {
          id: 'origin-note', shortId: 'origin-note', title: 'Origin', content: '', teamPath: null as string | null,
          tags: [], description: '', permalink: null, publishLink: 'https://hackmd.io/origin-note', folderPaths: [],
          readPermission: 'owner', writePermission: 'owner', createdAtMillis: null, updatedAtMillis: null,
          lastChangeUser: null, publishedAtMillis: null, publishType: 'edit', tagsUpdatedAtMillis: null,
          titleUpdatedAtMillis: null, userPath: null,
        };
        let created = false;
        for (const channel of [channels.hackmdListNotes, channels.hackmdListTeamNotes]) {
          replace(channel, (_event, teamPath) => ({ source: 'remote', data: created && note.teamPath === (teamPath ?? null) ? [note] : [] }));
        }
        replace(channels.hackmdGetNote, () => ({ source: 'remote', data: note }));
        for (const channel of [channels.hackmdListFolders, channels.hackmdListTeamFolders, channels.hackmdListHistory]) {
          replace(channel, () => ({ source: 'remote', data: [] }));
        }
        for (const channel of [channels.hackmdGetFolderOrder, channels.hackmdGetTeamFolderOrder]) {
          replace(channel, () => ({ source: 'remote', data: {} }));
        }
        const hold = (input: { title?: string; content?: string }, teamPath: string | null) => new Promise((done) => {
          ipcMain.once('fixture:complete-mutation', () => {
            note = { ...note, ...input, teamPath };
            created = true;
            done(note);
          });
        });
        replace(channels.hackmdCreateNote, (_event, input) => hold(input, null));
        replace(channels.hackmdCreateTeamNote, (_event, teamPath, input) => hold(input, teamPath));
        replace(channels.hackmdUpdateNote, (_event, _id, input) => hold(input, null));
        replace(channels.hackmdUpdateTeamNote, (_event, teamPath, _id, input) => hold(input, teamPath));
      }, { channels: ELECTRON_CHANNELS, settings: defaultSettings });
      await page.reload();
      await expect(page.getByRole('button', { name: 'Team B, private', exact: true })).toBeVisible();
      const originButton = origin === 'personal' ? 'My Workspace' : 'Team A, private';
      const scopeKey = origin === 'personal' ? origin : `team:${origin}`;
      await page.getByRole('button', { name: originButton, exact: true }).click();
      await page.keyboard.press(`${primary}+n`);
      const editor = page.locator('.cm-content');
      await editor.fill('# Origin submitted');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const waitForPending = () => expect.poll(() => app.evaluate(({ ipcMain }) => ipcMain.listenerCount('fixture:complete-mutation'))).toBe(1);
      await waitForPending();
      await editor.fill('# Origin later');
      await page.getByRole('button', { name: 'Team B, private', exact: true }).click();
      await page.keyboard.press(`${primary}+n`);
      await editor.fill('B untouched');
      await expect.poll(() => page.evaluate(() => localStorage.getItem('hackdesk_note_workspace:team:team-b'))).toContain('B untouched');
      const destination = await page.evaluate(() => localStorage.getItem('hackdesk_note_workspace:team:team-b'));
      await app.evaluate(({ ipcMain }) => { ipcMain.emit('fixture:complete-mutation'); });
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(`hackdesk_note_workspace:${key}`), scopeKey)).toContain('origin-note');
      await expect(editor).toContainText('B untouched');
      await expect(page.getByRole('button', { name: 'Select Origin submitted tab', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('hackdesk_note_workspace:team:team-b'))).toBe(destination);
      await page.getByRole('button', { name: originButton, exact: true }).click();
      await expect(editor).toContainText('# Origin later');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await waitForPending();
      await editor.fill('# Origin even later');
      await page.getByRole('button', { name: 'Team B, private', exact: true }).click();
      await app.evaluate(({ ipcMain }) => { ipcMain.emit('fixture:complete-mutation'); });
      await expect.poll(() => page.evaluate((key) => {
        const layout = JSON.parse(localStorage.getItem(`hackdesk_note_workspace:${key}`) ?? '{}');
        return Object.values(layout.drafts ?? {}).map((draft) => (draft as { baseContent: string }).baseContent);
      }, scopeKey)).toEqual(['# Origin later']);
      await expect(editor).toContainText('B untouched');
      await page.reload();
      await page.getByRole('button', { name: originButton, exact: true }).click();
      await expect(editor).toContainText('# Origin even later');
      await expect(page.getByRole('button', { name: 'Select Origin submitted tab', exact: true })).toHaveCount(1);
    } finally {
      if (app.process().exitCode === null) {
        const exited = new Promise<void>((done) => app.process().once('exit', () => done()));
        app.process().kill('SIGKILL');
        await exited;
      }
    }
  });
}
