import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openPalette(page: Page, search: string) {
  await page.keyboard.press(`${primary}+Shift+P`);
  await page.getByRole('combobox').fill(search);
}

test('the palette highlights matches, moves and renames notes, and opens a Settings page', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-palette-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(join(vault, 'Archive'), { recursive: true });
  await writeFile(join(vault, 'Plan.md'), '# Plan\n\nShip offline reading first.\n');
  await writeFile(join(vault, 'Archive', 'Old.md'), '# Old\n\nLast year.\n');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /^Plan/ }).first().click();
    await expect(page.locator('.cm-content')).toContainText('Ship offline reading first.');

    await openPalette(page, 'nn');
    const newNote = page.getByRole('option', { name: /^New Note(?! from)/ });
    await expect(newNote.locator('mark')).toHaveText(['N', 'N']);
    await page.keyboard.press('Escape');

    await openPalette(page, 'move note');
    await page.getByRole('option', { name: /^Move Note to Folder/ }).click();
    const picker = page.getByRole('dialog', { name: 'Move Note to Folder' });
    await picker.getByRole('option', { name: /^Archive/ }).click();
    await expect(picker).toHaveCount(0);
    await expect.poll(async () => (await readdir(join(vault, 'Archive'))).sort()).toEqual(['Old.md', 'Plan.md']);

    await openPalette(page, 'rename note');
    await page.getByRole('option', { name: /^Rename Note/ }).click();
    const rename = page.getByRole('dialog', { name: 'Rename Note' });
    await expect(rename.getByLabel('Title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(rename).toHaveCount(0);

    await openPalette(page, 'settings ai');
    await page.getByRole('option', { name: /^Open Settings: AI/ }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
  } finally {
    await app.close();
  }
});
