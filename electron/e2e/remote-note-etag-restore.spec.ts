import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

type Fixture = { conditionalReads: string[]; writes: number; restores: string[]; confirmations: string[] };

async function launchWithRemoteNote() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-remote-etag-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(defaultSettings));
  const env = { ...process.env };
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
    const note = {
      id: 'remote-note', shortId: 'remote-note', title: 'Remote', content: 'Saved remote body', teamPath: null,
      tags: [], description: '', permalink: null, publishLink: 'https://hackmd.io/remote-note', folderPaths: [],
      readPermission: 'owner', writePermission: 'owner', createdAtMillis: null, updatedAtMillis: 1,
      lastChangeUser: null, publishedAtMillis: null, publishType: 'edit', tagsUpdatedAtMillis: null,
      titleUpdatedAtMillis: null, userPath: null, etag: 'W/"1"',
    };
    const fixture = { conditionalReads: [] as string[], writes: 0, restores: [] as string[], confirmations: [] as string[], deleted: false };
    (globalThis as { remoteNoteFixture?: typeof fixture }).remoteNoteFixture = fixture;
    replace(channels.settingsGet, () => ({
      ...settings, hasHackmdApiToken: true, hasAppearanceSettings: true,
      shouldShowHackmdOnboarding: false, hasLocalVault: false,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    }));
    replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
      id: 'fixture-user', name: 'Fixture', username: 'fixture', email: null, photo: null, teams: [], upgraded: false,
    } }));
    replace(channels.hackmdListTeams, () => ({ source: 'remote', data: [] }));
    replace(channels.hackmdListNotes, () => ({ source: 'remote', data: fixture.deleted ? [] : [{ ...note }] }));
    replace(channels.hackmdGetNote, () => ({ source: 'remote', data: { ...note } }));
    replace(channels.hackmdGetNoteIfChanged, (_event, _noteId: string, _teamPath: string | null, etag: string) => {
      fixture.conditionalReads.push(etag);
      return etag === note.etag ? null : { ...note };
    });
    replace(channels.hackmdUpdateNote, (_event, _noteId: string, input: { content?: string }) => {
      fixture.writes += 1;
      note.content = input.content ?? note.content;
      note.etag = `W/"${fixture.writes + 1}"`;
      return { ...note };
    });
    replace(channels.appConfirm, (_event, request: { detail?: string }) => {
      fixture.confirmations.push(request.detail ?? '');
      return { confirmed: true };
    });
    replace(channels.hackmdDeleteNote, () => { fixture.deleted = true; });
    replace(channels.hackmdRestoreNote, (_event, noteId: string) => {
      fixture.restores.push(noteId);
      fixture.deleted = false;
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
    const { conditionalReads, writes, restores, confirmations } = (globalThis as unknown as { remoteNoteFixture: Fixture }).remoteNoteFixture;
    return { conditionalReads, writes, restores, confirmations };
  });
}

test('checks HackMD with the ETag before each save', async () => {
  const { app, page } = await launchWithRemoteNote();
  try {
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Saved remote body');

    await editor.fill('First edit');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readFixture(app)).writes).toBe(1);

    // The second save sends the ETag returned by the first one.
    await editor.fill('Second edit');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readFixture(app)).writes).toBe(2);
    expect((await readFixture(app)).conditionalReads).toEqual(['W/"1"', 'W/"2"']);
  } finally {
    app.process().kill('SIGKILL');
  }
});

test('restores a deleted personal note from the toast', async () => {
  const { app, page } = await launchWithRemoteNote();
  try {
    await expect(page.locator('.cm-content')).toContainText('Saved remote body');
    const noteRow = page.getByRole('treeitem', { name: 'Remote', exact: true });
    await expect(noteRow).toBeVisible();

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Delete/ }).click();
    await expect(noteRow).toHaveCount(0);
    expect((await readFixture(app)).confirmations).toEqual(['This moves the note to your HackMD trash. You can undo this right after deleting.']);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Restored “Remote”.')).toBeVisible();
    await expect(noteRow).toBeVisible();
    expect((await readFixture(app)).restores).toEqual(['remote-note']);
  } finally {
    app.process().kill('SIGKILL');
  }
});
