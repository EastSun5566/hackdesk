import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ELECTRON_CHANNELS } from '../src/shared/channels';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

async function launch(home: string) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page };
}

// Playwright cannot paste files from the OS clipboard, so dispatch the same paste event Chromium would.
async function pasteImage(page: Page, name: string) {
  await page.locator('.cm-content').evaluate((element, fileName) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], fileName, { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, name);
}

// Release a held upload only after the renderer's request reached the handler.
async function releaseUpload(app: ElectronApplication, fileName: string) {
  await expect.poll(() => app.evaluate((_electron, name) => (
    (globalThis as { pendingUploads?: Set<string> }).pendingUploads?.has(name) ?? false
  ), fileName)).toBe(true);
  await app.evaluate(({ ipcMain }, name) => { ipcMain.emit(`fixture:release-upload:${name}`); }, fileName);
}

async function replaceRemoteIpc(app: ElectronApplication) {
  // Replace remote IPC only. Uploads wait for a release message from the test.
  await app.evaluate(({ ipcMain }, { channels, settings }) => {
    const replace = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, handler);
    };
    const note = (id: string, title: string) => ({
      id, shortId: id, title, content: `${title} body`, teamPath: null, tags: [], description: '', permalink: null,
      publishLink: `https://hackmd.io/${id}`, folderPaths: [], readPermission: 'owner', writePermission: 'owner',
      createdAtMillis: null, updatedAtMillis: 1, lastChangeUser: null, publishedAtMillis: null, publishType: 'edit',
      tagsUpdatedAtMillis: null, titleUpdatedAtMillis: null, userPath: null,
    });
    const notes = [note('note-a', 'Alpha'), note('note-b', 'Beta')];
    replace(channels.settingsGet, () => ({
      ...settings, hasHackmdApiToken: true, hasAppearanceSettings: true, shouldShowHackmdOnboarding: false,
      hasLocalVault: false, hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    }));
    replace(channels.hackmdGetCurrentUser, () => ({ source: 'remote', data: {
      id: 'fixture-user', name: 'Fixture', username: 'fixture', email: null, photo: null, teams: [], upgraded: false,
    } }));
    replace(channels.hackmdListTeams, () => ({ source: 'remote', data: [] }));
    replace(channels.hackmdListNotes, () => ({ source: 'remote', data: notes }));
    replace(channels.hackmdGetNote, (_event, id) => ({ source: 'remote', data: notes.find((candidate) => candidate.id === id) }));
    for (const channel of [channels.hackmdListFolders, channels.hackmdListHistory]) {
      replace(channel, () => ({ source: 'remote', data: [] }));
    }
    replace(channels.hackmdGetFolderOrder, () => ({ source: 'remote', data: {} }));
    const pending = new Set<string>();
    (globalThis as { pendingUploads?: Set<string> }).pendingUploads = pending;
    replace(channels.hackmdUploadNoteImage, (_event, _noteId, input: { fileName: string }) => new Promise((done) => {
      pending.add(input.fileName);
      ipcMain.once(`fixture:release-upload:${input.fileName}`, () => {
        pending.delete(input.fileName);
        done({ link: `https://assets.example/${input.fileName}` });
      });
    }));
  }, { channels: ELECTRON_CHANNELS, settings: defaultSettings });
}

test('a remote image upload finishes in its original tab after switching, and is dropped after closing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-upload-origin-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify(defaultSettings));
  const { app, page } = await launch(home);
  try {
    await replaceRemoteIpc(app);
    await page.reload();
    const editor = page.locator('.cm-content');
    await page.getByRole('treeitem', { name: /Alpha/ }).first().click();
    await expect(editor).toContainText('Alpha body');
    await editor.click();
    await page.keyboard.press('End');
    await pasteImage(page, 'first.png');
    await expect(editor).toContainText('Uploading image');

    await page.getByRole('treeitem', { name: /Beta/ }).first().click();
    await expect(editor).toContainText('Beta body');
    await releaseUpload(app, 'first.png');
    await expect(editor).not.toContainText('first.png');

    await page.getByRole('tab', { name: 'Select Alpha tab', exact: true }).click();
    await expect(editor).toContainText('Alpha body![first.png](https://assets.example/first.png)');
    await expect(editor).not.toContainText('Uploading image');

    // An upload whose tab was closed is not applied anywhere.
    await editor.click();
    await page.keyboard.press('End');
    await pasteImage(page, 'second.png');
    await expect(editor).toContainText('Uploading image');
    // Closing a dirty tab asks for confirmation through a native dialog; accept it.
    await app.evaluate(({ ipcMain }, channel) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ confirmed: true }));
    }, ELECTRON_CHANNELS.appConfirm);
    await page.getByRole('button', { name: 'Close Alpha', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Select Alpha tab', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Select Beta tab', exact: true }).click();
    await releaseUpload(app, 'second.png');
    await expect(page.getByText('after its tab was closed')).toBeVisible();
    await expect(editor).not.toContainText('second.png');
  } finally {
    app.process().kill('SIGKILL');
  }
});

test('a Local Vault image paste writes the attachment and inserts its link', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-upload-local-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Original.md'), '# Original\n\nSaved body');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const { app, page } = await launch(home);
  try {
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Saved body');
    await editor.click();
    await page.keyboard.press('Control+End');
    await pasteImage(page, 'local.png');
    await expect(editor).toContainText('![local.png](');
    await expect(editor).not.toContainText('Uploading image');
    await expect.poll(async () => readdir(join(vault, 'attachments')).catch(() => [])).toContain('local.png');
  } finally {
    app.process().kill('SIGKILL');
  }
});
