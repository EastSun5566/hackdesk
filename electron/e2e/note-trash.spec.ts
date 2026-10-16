import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

type Fixture = { restoreRequests: string[][]; failIds: string[] };

async function launchWithTrash() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-note-trash-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(defaultSettings));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Replace remote IPC only, so no credentials or network are needed.
  await app.evaluate(({ ipcMain }, { channels, settings }) => {
    const replace = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, handler);
    };
    const createNote = (id: string, title: string) => ({
      id, shortId: id, title, content: `${title} body`, teamPath: null,
      tags: [], description: '', permalink: null, publishLink: `https://hackmd.io/${id}`, folderPaths: [],
      readPermission: 'owner', writePermission: 'owner', createdAtMillis: null, updatedAtMillis: 1,
      lastChangeUser: null, publishedAtMillis: null, publishType: 'edit', tagsUpdatedAtMillis: null,
      titleUpdatedAtMillis: null, userPath: null, etag: 'W/"1"',
    });
    const notes = [createNote('kept', 'Kept')];
    const trash = [
      { id: 'roadmap', title: 'Roadmap', tags: [], deletedAtMillis: Date.UTC(2026, 9, 15, 12), permanentDeleteAtMillis: null },
      { id: 'meeting', title: 'Meeting', tags: [], deletedAtMillis: Date.UTC(2026, 9, 12, 12), permanentDeleteAtMillis: Date.UTC(2026, 10, 11, 12) },
    ];
    const fixture = { restoreRequests: [] as string[][], failIds: [] as string[] };
    (globalThis as { trashFixture?: typeof fixture }).trashFixture = fixture;
    replace(channels.settingsGet, () => ({
      ...settings, hasHackmdApiToken: true, hasAppearanceSettings: true,
      shouldShowHackmdOnboarding: false, hasLocalVault: false,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    }));
    replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
      id: 'fixture-user', name: 'Fixture', username: 'fixture', email: null, photo: null, teams: [], upgraded: false,
    } }));
    replace(channels.hackmdListTeams, () => ({ source: 'remote', data: [] }));
    replace(channels.hackmdListNotes, () => ({ source: 'remote', data: notes.map((note) => ({ ...note })) }));
    replace(channels.hackmdGetNote, (_event, noteId: string) => {
      const note = notes.find((candidate) => candidate.id === noteId);
      return note ? { source: 'remote', data: { ...note } } : { source: 'error', error: 'HackMD could not find this note.' };
    });
    replace(channels.hackmdListTrash, () => trash.map((note) => ({ ...note })));
    replace(channels.hackmdRestoreNotes, (_event, noteIds: string[]) => {
      fixture.restoreRequests.push(noteIds);
      return Object.fromEntries(noteIds.map((noteId) => {
        if (fixture.failIds.includes(noteId)) return [noteId, { status: 'failure', reason: 'NOT_FOUND' }];
        const index = trash.findIndex((note) => note.id === noteId);
        const [restored] = trash.splice(index, 1);
        notes.push(createNote(restored.id, restored.title));
        return [noteId, { status: 'success' }];
      }));
    });
    for (const channel of [channels.hackmdListFolders, channels.hackmdListHistory]) {
      replace(channel, () => ({ source: 'remote', data: [] }));
    }
    replace(channels.hackmdGetFolderOrder, () => ({ source: 'remote', data: {} }));
  }, { channels: ELECTRON_CHANNELS, settings: defaultSettings });
  await page.reload();
  return { app, page };
}

function readFixture(app: ElectronApplication) {
  return app.evaluate(() => {
    const { restoreRequests } = (globalThis as unknown as { trashFixture: Fixture }).trashFixture;
    return { restoreRequests };
  });
}

test('restores one note from the trash and opens it', async () => {
  const { app, page } = await launchWithTrash();
  try {
    await expect(page.getByRole('treeitem', { name: 'Kept', exact: true })).toBeVisible();
    await page.getByTestId('workspace-rail-utilities').getByRole('button', { name: 'Trash' }).click();

    const dialog = page.getByRole('dialog', { name: 'Trash' });
    const rows = dialog.getByRole('list', { name: 'Deleted notes' }).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Kept until');

    await dialog.getByRole('button', { name: 'Restore Roadmap' }).click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('Restored “Roadmap”.')).toBeVisible();

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('Roadmap body');
    await expect(page.getByRole('treeitem', { name: 'Roadmap', exact: true })).toBeVisible();
    expect((await readFixture(app)).restoreRequests).toEqual([['roadmap']]);
  } finally {
    app.process().kill('SIGKILL');
  }
});

test('keeps notes HackMD could not restore in a batch', async () => {
  const { app, page } = await launchWithTrash();
  try {
    await app.evaluate(() => {
      (globalThis as unknown as { trashFixture: Fixture }).trashFixture.failIds.push('meeting');
    });
    await expect(page.getByRole('treeitem', { name: 'Kept', exact: true })).toBeVisible();
    await page.getByTestId('workspace-rail-utilities').getByRole('button', { name: 'Trash' }).click();

    const dialog = page.getByRole('dialog', { name: 'Trash' });
    const rows = dialog.getByRole('list', { name: 'Deleted notes' }).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await dialog.getByRole('checkbox', { name: 'Select all' }).click();
    await dialog.getByRole('button', { name: 'Restore 2 Notes' }).click();

    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Meeting');
    await expect(rows.first()).toContainText('Already removed or restored.');
    await expect(page.getByText('Restored 1 of 2 notes.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Restore 1 Note' })).toBeEnabled();
    expect((await readFixture(app)).restoreRequests).toEqual([['roadmap', 'meeting']]);
  } finally {
    app.process().kill('SIGKILL');
  }
});
