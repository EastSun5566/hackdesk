import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

type Fixture = { savedContent: string[]; compares: string[][] };

async function launchWithVersionedNote() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-note-versions-'));
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
    const note = {
      id: 'remote-note', shortId: 'remote-note', title: 'Roadmap', content: '# Roadmap\n\nShip v2 in November.\n', teamPath: null,
      tags: [], description: '', permalink: null, publishLink: 'https://hackmd.io/remote-note', folderPaths: [],
      readPermission: 'owner', writePermission: 'owner', createdAtMillis: null, updatedAtMillis: Date.UTC(2026, 9, 15, 6),
      lastChangeUser: null, publishedAtMillis: null, publishType: 'edit', tagsUpdatedAtMillis: null,
      titleUpdatedAtMillis: null, userPath: null, etag: 'W/"1"',
    };
    const versions = [
      {
        id: 'v-2', name: 'Before launch', nameSource: 'user', description: 'Plan agreed with the team.',
        createdAtMillis: Date.UTC(2026, 9, 14, 10, 30), createdBy: { userId: 'u-1', displayName: 'Ada', photo: null }, contentAvailable: true,
      },
      {
        id: 'v-1', name: '', nameSource: 'system', description: null,
        createdAtMillis: Date.UTC(2026, 9, 13, 8), createdBy: null, contentAvailable: true,
      },
    ];
    const contents: Record<string, string> = {
      'v-2': '# Roadmap\n\nShip v2 in October.\n',
      'v-1': '# Roadmap\n',
    };
    const fixture = { savedContent: [] as string[], compares: [] as string[][] };
    (globalThis as { versionsFixture?: typeof fixture }).versionsFixture = fixture;
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
    replace(channels.hackmdGetNoteIfChanged, (_event, _noteId: string, _teamPath: string | null, etag: string) => (
      etag === note.etag ? null : { ...note }
    ));
    replace(channels.hackmdUpdateNote, (_event, _noteId: string, input: { content?: string }) => {
      fixture.savedContent.push(input.content ?? '');
      note.content = input.content ?? note.content;
      note.etag = `W/"${fixture.savedContent.length + 1}"`;
      return { ...note };
    });
    replace(channels.hackmdListNoteVersions, () => ({ versions, page: 1, totalPages: 1, total: versions.length }));
    replace(channels.hackmdGetNoteVersion, (_event, _noteId: string, versionId: string) => ({
      ...versions.find((version) => version.id === versionId), content: contents[versionId],
    }));
    replace(channels.hackmdCompareNoteVersions, (_event, _noteId: string, base: string, target: string) => {
      fixture.compares.push([base, target]);
      return { unifiedDiff: '@@ -1,3 +1,3 @@\n # Roadmap\n \n-Ship v2 in October.\n+Ship v2 in November.\n' };
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
  return app.evaluate(() => (globalThis as unknown as { versionsFixture: Fixture }).versionsFixture);
}

test('compares a saved version and restores it into the editor', async () => {
  const { app, page } = await launchWithVersionedNote();
  try {
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Ship v2 in November.');

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Version History/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Version History' });
    await expect(dialog.getByRole('list', { name: 'Versions' }).getByRole('button')).toHaveText([
      /Current/, /Before launch.*Ada/, /Auto-saved/,
    ]);

    const changes = dialog.getByRole('list', { name: 'Changes since Before launch' });
    await expect(changes).toContainText('Removed: Ship v2 in October.');
    await expect(changes).toContainText('Added: Ship v2 in November.');
    expect((await readFixture(app)).compares).toEqual([['version:v-2', 'note_content']]);

    await dialog.getByRole('tab', { name: 'Full text' }).click();
    await expect(dialog.getByText('Ship v2 in October.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Restore into Editor' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editor).toContainText('Ship v2 in October.');
    await expect(page.getByRole('status', { name: 'Sync state: Unsaved' })).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readFixture(app)).savedContent).toEqual(['# Roadmap\n\nShip v2 in October.\n']);
  } finally {
    app.process().kill('SIGKILL');
  }
});
