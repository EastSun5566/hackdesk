import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

const suggestions = (page: Page) => page.locator('.cm-tooltip-autocomplete');

test('typing HackMD syntax suggests emoji, code languages, containers and embeds', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-completions-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Draft.md'), '# Draft\n');
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
    await page.getByRole('treeitem', { name: /^Draft/ }).first().click();
    const editor = page.locator('.cm-content');
    await expect(editor).toHaveText('# Draft');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');

    await page.keyboard.type('\nShip it :smi');
    await suggestions(page).getByRole('option', { name: /^:smile:/ }).click();

    // A time is ordinary text.
    await page.keyboard.type(' at 10:30');
    await expect(suggestions(page)).toHaveCount(0);

    await page.keyboard.type('\n\n```mer');
    await expect(suggestions(page).getByRole('option').first()).toHaveText(/^mermaid/);
    await page.keyboard.press('Enter');
    await page.keyboard.type('graph TD');
    await page.keyboard.press('ControlOrMeta+End');

    await page.keyboard.type('\n\n:::wa');
    await expect(suggestions(page).getByRole('option').first()).toHaveText(/^warning/);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Careful');
    await page.keyboard.press('ControlOrMeta+End');

    await page.keyboard.type('\n\n{%you');
    await expect(suggestions(page).getByRole('option').first()).toHaveText(/^youtube/);
    await page.keyboard.press('Enter');
    await page.keyboard.type('abc123');

    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByRole('status', { name: /Sync state: (Saved|Synced)/ })).toBeVisible();
    await expect.poll(() => readFile(join(vault, 'Draft.md'), 'utf8')).toBe([
      '# Draft',
      '',
      'Ship it :smile: at 10:30',
      '',
      '```mermaid',
      'graph TD',
      '```',
      '',
      ':::warning',
      'Careful',
      ':::',
      '',
      '{%youtube abc123 %}',
    ].join('\n'));
  } finally {
    await app.close();
  }
});
