import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

function environment() {
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  return env;
}

const editor = (page: Page) => page.locator('.cm-content');

async function runCommand(page: Page, label: string) {
  await page.keyboard.press(`${primary}+Shift+P`);
  await page.getByRole('combobox').fill(label);
  await page.getByRole('option', { name: new RegExp(`^${label}`) }).click();
}

test('Local Vault notes start from a Templates folder, and any note can be saved as a template', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-templates-'));
  const vault = join(directory, 'vault');
  await mkdir(join(directory, '.hackdesk'), { recursive: true });
  await mkdir(join(vault, 'Templates'), { recursive: true });
  await writeFile(join(vault, 'Templates', 'Meeting.md'), '# Meeting\n\n## Agenda\n\n## Decisions\n');
  await writeFile(join(vault, 'Plan.md'), '# Plan\n\nShip the book reader.\n');
  await writeFile(join(directory, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(directory, 'user-data')}`, `--hackdesk-home=${directory}`], cwd: repoRoot, env: environment() });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('treeitem', { name: /^Plan/ }).first()).toBeVisible();

    await runCommand(page, 'New Note from Template');
    const picker = page.getByRole('dialog', { name: 'New Note from Template' });
    await picker.getByRole('option', { name: /Meeting/ }).click();
    await expect(picker).toHaveCount(0);
    await expect(editor(page)).toContainText('Decisions');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readdir(vault)).filter(name => name.endsWith('.md')).length).toBe(2);

    await page.getByRole('treeitem', { name: /^Plan/ }).first().click();
    await expect(editor(page)).toContainText('Ship the book reader.');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Save as Template/ }).click();
    await expect.poll(async () => (await readdir(join(vault, 'Templates'))).sort()).toEqual(['Meeting.md', 'Plan.md']);
    expect(await readFile(join(vault, 'Templates', 'Plan.md'), 'utf8')).toContain('Ship the book reader.');
  } finally {
    await app.close();
  }
});

type TemplatesFixture = { createdFolders: string[]; createdNotes: { title: string; parentFolderId: string | null }[] };

function readFixture(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as unknown as { templatesFixture: TemplatesFixture }).templatesFixture);
}

test('Save as Template creates the HackMD Templates folder, and its notes start new ones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-hackmd-templates-'));
  await mkdir(join(directory, '.hackdesk'), { recursive: true });
  await writeFile(join(directory, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, hackmdApiToken: 'synthetic-fixture-token', onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({
    args: [join(repoRoot, 'electron/e2e/fixtures/hackmd-templates-network.cjs'), `--hackdesk-home=${directory}`, `--user-data-dir=${join(directory, 'user-data')}`],
    cwd: repoRoot,
    env: environment(),
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /Standup/ }).first().click();
    await expect(editor(page)).toContainText('Yesterday');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Save as Template/ }).click();
    await expect.poll(async () => readFixture(app)).toEqual({
      createdFolders: ['Templates'],
      createdNotes: [{ title: 'Standup', parentFolderId: 'folder-1' }],
    });

    await runCommand(page, 'New Note from Template');
    await page.getByRole('dialog', { name: 'New Note from Template' }).getByRole('option', { name: /Standup/ }).click();
    await expect(page.getByRole('status', { name: 'Sync state: Unsaved' })).toBeVisible();
    await expect(editor(page)).toContainText('Today');
  } finally {
    // The new note is left as an unsaved draft, which would hold the window open.
    app.process().kill('SIGKILL');
  }
});
