import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

type Fixture = { resolutions: Array<[string, boolean]> };

async function launchWithComments() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-note-comments-'));
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
    const content = ['# Roadmap', '', 'The ship date moves to Q4.', '', 'Teh launch checklist is ready.'].join('\n');
    const note = {
      id: 'roadmap', shortId: 'roadmap', title: 'Roadmap', content, teamPath: null,
      tags: [], description: '', permalink: null, publishLink: 'https://hackmd.io/roadmap', folderPaths: [],
      readPermission: 'owner', writePermission: 'owner', createdAtMillis: null, updatedAtMillis: 1,
      lastChangeUser: null, publishedAtMillis: null, publishType: 'edit', tagsUpdatedAtMillis: null,
      titleUpdatedAtMillis: null, userPath: null, etag: 'W/"1"',
    };
    const at = (excerpt: string) => ({ offset: content.indexOf(excerpt), length: excerpt.length });
    const head = (id: string, threadId: string, body: string, excerpt: string, resolved: boolean, createdAtMillis: number) => ({
      id, threadId, actor: { kind: 'user', displayName: 'Ada' }, body, status: 'open', statusReason: null, isThreadHead: true,
      threadStatus: resolved ? 'hidden' : 'open', threadStatusReason: resolved ? 'resolved' : null,
      anchor: at(excerpt), currentAnchor: at(excerpt), excerpt, createdAtMillis, updatedAtMillis: createdAtMillis,
    });
    const comments = [
      head('11111111-1111-4111-8111-111111111111', 't-1', 'Should this be Q4?', 'ship date', false, Date.UTC(2026, 9, 15, 12)),
      {
        ...head('22222222-2222-4222-8222-222222222222', 't-1', 'Yes, moved it.', 'ship date', false, Date.UTC(2026, 9, 15, 13)),
        actor: { kind: 'user', displayName: 'Bob' }, isThreadHead: false, threadStatus: null, threadStatusReason: null, excerpt: null,
      },
      head('33333333-3333-4333-8333-333333333333', 't-2', 'Typo: "The".', 'Teh launch', true, Date.UTC(2026, 9, 14, 12)),
    ];
    const fixture = { resolutions: [] as Array<[string, boolean]> };
    (globalThis as { commentsFixture?: typeof fixture }).commentsFixture = fixture;
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
    replace(channels.hackmdListNoteVersions, () => ({ versions: [], page: 1, totalPages: 1, total: 0 }));
    replace(channels.hackmdListNoteComments, () => ({ comments: comments.map((comment) => ({ ...comment })), page: 1, hasNext: false }));
    replace(channels.hackmdSetNoteCommentResolved, (_event, _noteId: string, commentId: string, resolved: boolean) => {
      fixture.resolutions.push([commentId, resolved]);
      const target = comments.find((comment) => comment.id === commentId)!;
      target.threadStatus = resolved ? 'hidden' : 'open';
      target.threadStatusReason = resolved ? 'resolved' : null;
      return { status: 'updated' };
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
  return app.evaluate(() => (globalThis as unknown as { commentsFixture: Fixture }).commentsFixture.resolutions);
}

test('shows comments, jumps to their text, and resolves and reopens threads', async () => {
  const { app, page } = await launchWithComments();
  try {
    await expect(page.locator('.cm-content')).toContainText('ship date');
    await page.getByRole('button', { name: 'Expand note details' }).click();
    await page.getByRole('button', { name: /^Comments/ }).click();

    const open = page.getByRole('list', { name: 'Open comments' });
    await expect(open).toContainText('Should this be Q4?');
    await expect(open.getByRole('list', { name: 'Replies' })).toContainText('Yes, moved it.');
    await expect(page.getByRole('button', { name: /^Resolved \(1\)/ })).toBeVisible();

    await open.getByRole('button', { name: 'Show “ship date” in note' }).click();
    await expect(page.locator('.cm-hackmd-initial-reveal-match')).toHaveText('ship date');

    await open.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('No open comments.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resolved \(2\)/ })).toBeVisible();

    await page.getByRole('button', { name: /^Resolved \(2\)/ }).click();
    const resolved = page.getByRole('list', { name: 'Resolved comments' });
    await resolved.getByRole('listitem').filter({ hasText: 'Typo' }).getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('list', { name: 'Open comments' })).toContainText('Typo: "The".');
    expect(await readFixture(app)).toEqual([
      ['11111111-1111-4111-8111-111111111111', true],
      ['33333333-3333-4333-8333-333333333333', false],
    ]);
  } finally {
    app.process().kill('SIGKILL');
  }
});
