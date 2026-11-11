import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch(home: string) {
  const env: Record<string, string> = { ...definedEnvironment(process.env), HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  await expect.poll(() => app.windows().some((page) => page.url().includes('#/electron'))).toBe(true);
  const page = app.windows().find((candidate) => candidate.url().includes('#/electron'))!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page };
}

async function stop(app: ElectronApplication) {
  // A closed app no longer has a process, and asking for it throws.
  let child: ReturnType<ElectronApplication['process']> | undefined;
  try { child = app.process(); } catch { return; }
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  child.kill('SIGKILL');
  await exited;
}

async function openVaultSettings(page: Page) {
  await page.keyboard.press(`${primary}+,`);
  await page.getByRole('tab', { name: 'Vault', exact: true }).click();
}

test('a named local workspace groups folders under one root and survives a restart', async () => {
  test.setTimeout(120_000);
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-local-workspace-'));
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(join(home, 'A'));
  await mkdir(join(home, 'B'));
  const vaultA = await realpath(join(home, 'A'));
  const vaultB = await realpath(join(home, 'B'));
  await writeFile(join(vaultA, 'A note.md'), '# A note\n\nOnly in A.');
  await writeFile(join(vaultB, 'B note.md'), '# B note\n\nOnly in B.');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: {
      vaults: [{ id: 'vault-a', path: vaultA }, { id: 'vault-b', path: vaultB }],
      activeVaultId: 'vault-a',
      workspaces: [],
      activeWorkspaceId: null,
    },
    onboarding: { hackmdTokenSetupDeferred: true },
  }));

  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    // Without a workspace the sidebar's one root, Files, holds the open folder's notes.
    await expect(page.getByRole('button', { name: 'Collapse Files', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Switch workspace, current: A/ })).toBeVisible();

    await openVaultSettings(page);
    // The create form stays folded away until asked for.
    await page.getByRole('button', { name: 'New workspace', exact: true }).click();
    const form = page.getByRole('group', { name: 'Create a workspace' });
    await form.getByLabel('Workspace name', { exact: true }).fill('Work');
    await form.getByLabel('A', { exact: true }).check();
    await form.getByLabel('B', { exact: true }).check();
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit workspace Work', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Every folder in the set sits under the one Files root with its own tree.
    await expect(page.getByRole('button', { name: /^Switch workspace, current: Work/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse Files', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide A notes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open B', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'B note', exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    // B's note opens straight into the set's tabs: A's tab stays, and B's folder becomes the open one.
    // Pressed on the row's padding, outside its label: the whole row opens the note.
    await page.getByRole('button', { name: 'B note', exact: true }).locator('..').click({ position: { x: 2, y: 2 } });
    await expect(page.locator('.cm-content')).toContainText('Only in B.');
    await expect(page.getByRole('tab', { name: /A note/ })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /B note/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Switch workspace, current: Work/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide B notes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open A', exact: true })).toBeVisible();
    // The sidebar never fell back to a loading skeleton while B opened.
    await expect(page.getByRole('status', { name: 'Loading notes' })).toHaveCount(0);

    // B's note saves into B's folder.
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n\nEdited in B.');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFile(join(vaultB, 'B note.md'), 'utf8')).toContain('Edited in B.');
    // A's note is still read from A while B is the open folder.
    await page.getByRole('tab', { name: /A note/ }).click();
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    await expect(page.getByRole('button', { name: 'Hide B notes', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /B note/ }).click();
    await expect(page.locator('.cm-content')).toContainText('Edited in B.');
    // A folder header only opens the folder; the note on screen stays.
    await page.getByRole('button', { name: 'Open A', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hide A notes', exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Edited in B.');
    await page.getByRole('button', { name: 'Open B', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hide B notes', exact: true })).toBeVisible();
    // Opening B leaves the set in its stored order instead of moving B to the top.
    const sectionOrder = () => page.locator('[data-workspace-folder-id]').evaluateAll((sections) => (
      sections.map((section) => section.querySelector('button[aria-label^="Open "], button[aria-label^="Hide "]')?.getAttribute('aria-label'))
    ));
    await expect.poll(sectionOrder).toEqual(['Open A', 'Hide B notes']);
    // Alt+Up moves B above A without reopening anything.
    await page.getByRole('button', { name: 'Hide B notes', exact: true }).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(sectionOrder).toEqual(['Hide B notes', 'Open A']);
    await expect(page.locator('.cm-content')).toContainText('Only in B.');
    // Dragging A's header onto the top half of B puts it back first.
    const aHeader = await page.getByRole('button', { name: 'Open A', exact: true }).boundingBox();
    const bHeader = await page.getByRole('button', { name: 'Hide B notes', exact: true }).boundingBox();
    if (!aHeader || !bHeader) throw new Error('Folder headers are not on screen.');
    await page.mouse.move(aHeader.x + 40, aHeader.y + aHeader.height / 2);
    await page.mouse.down();
    await page.mouse.move(aHeader.x + 40, aHeader.y - 10, { steps: 4 });
    await page.mouse.move(bHeader.x + 40, bHeader.y + 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(sectionOrder).toEqual(['Open A', 'Hide B notes']);
    await expect(page.locator('.cm-content')).toContainText('Only in B.');

    await page.getByRole('button', { name: /^Switch workspace, current: Work/ }).click();
    const switcher = page.getByRole('dialog', { name: 'Workspaces' });
    await expect(switcher.getByRole('button', { name: 'Work', exact: true })).toHaveAttribute('aria-current', 'page');
    // The set's row stays folded: its folders are not repeated under it, since the sidebar shows
    // them. Each folder is still offered once below, to open on its own.
    await expect(switcher.getByRole('button', { name: 'Show folders in Work', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(switcher.getByRole('list', { name: 'Folders in Work' })).toHaveCount(0);
    await expect(switcher.getByRole('button', { name: 'A', exact: true })).toHaveCount(1);
    await expect(switcher.getByRole('button', { name: 'B', exact: true })).toHaveCount(1);
    await page.keyboard.press('Escape');
    // Quit normally: a killed app may not have written its tabs to disk yet.
    await app.close();
  } finally {
    await stop(app);
  }

  // The named working set is stored settings, so the next launch opens onto it.
  ({ app, page } = await launch(home));
  try {
    await expect(page.getByRole('button', { name: /^Switch workspace, current: Work/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide B notes', exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Edited in B.');
    // The set's tabs, from both folders, come back with it.
    await expect(page.getByRole('tab', { name: /A note/ })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /B note/ })).toHaveCount(1);

    // Deleting the set leaves its folders known; the root falls back to the open folder.
    await openVaultSettings(page);
    await page.getByRole('button', { name: 'Delete workspace Work', exact: true }).click();
    await expect(page.getByText('No folders added yet.')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Switch workspace, current: B/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse Files', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open A', exact: true })).toHaveCount(0);
  } finally {
    await stop(app);
  }
});
