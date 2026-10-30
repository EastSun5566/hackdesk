import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

const suggestions = (page: Page) => page.locator('.cm-tooltip-autocomplete');

// CodeMirror ignores Enter for a moment after the list opens, so a fast test runner clicks instead.
async function choose(page: Page, label: string) {
  await suggestions(page).getByRole('option', { name: new RegExp(`^${label}`) }).click();
}

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
    await choose(page, ':smile:');

    // A time is ordinary text.
    await page.keyboard.type(' at 10:30');
    await expect(suggestions(page)).toHaveCount(0);

    await page.keyboard.type('\n\n```mer');
    await choose(page, 'mermaid');
    await page.keyboard.type('graph TD');
    await page.keyboard.press('ControlOrMeta+End');

    await page.keyboard.type('\n\n:::wa');
    await choose(page, 'warning');
    await page.keyboard.type('Careful');
    await page.keyboard.press('ControlOrMeta+End');

    await page.keyboard.type('\n\n{%you');
    await choose(page, 'youtube');
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

test('typing suggests front matter, alerts, metadata and slide attributes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-completions-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Deck.md'), '---\n\n---\n# Deck\n');
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
    await page.getByRole('treeitem', { name: /^Deck/ }).first().click();
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Deck');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');

    await page.keyboard.type('ty');
    await choose(page, 'type');
    await choose(page, 'slide');
    await page.keyboard.press('Enter');
    await page.keyboard.type('slideO');
    await choose(page, 'slideOptions');
    await choose(page, 'theme');
    await choose(page, 'solarized');

    // Line-start syntax first: Enter in a list or blockquote continues it.
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n[to');
    await choose(page, 'TOC');
    await page.keyboard.type('\n\n<!-- .el');
    await choose(page, 'element:');
    await choose(page, 'class="fragment"');

    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n\n> [!');
    await choose(page, 'Note');
    await page.keyboard.type('Read me');

    // Enter keeps the quote going, so this list item is inside it.
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n\n- [ti');
    await choose(page, 'time=');

    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByRole('status', { name: /Sync state: (Saved|Synced)/ })).toBeVisible();
    await expect.poll(() => readFile(join(vault, 'Deck.md'), 'utf8')).toMatch(new RegExp([
      '^---',
      'type: slide',
      'slideOptions:',
      '  theme: solarized',
      '---',
      '# Deck',
      '',
      '\\[TOC\\]',
      '',
      '<!-- \\.element: class="fragment" -->',
      '',
      '> \\[!NOTE\\]',
      '> Read me',
      '>',
      '> - \\[time=\\w{3}, \\w{3} \\d{1,2}, \\d{4} \\d{1,2}:\\d{2} [AP]M\\]$',
    ].join('\n')));
  } finally {
    await app.close();
  }
});
