import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

function environment() {
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  return env;
}

const DECK = [
  '---',
  'title: Synthetic deck',
  'type: slide',
  'slideOptions:',
  '  theme: solarized', // imports web fonts, which must not stop the theme loading
  '  transition: fade',
  '  hash: true', // the window keeps its own route in the URL hash
  '---',
  '',
  '# Welcome',
  '',
  '[Skip to the end](#the-end)',
  '',
  '---',
  '',
  '## Agenda',
  '',
  '----',
  '',
  '## Agenda details',
  '',
  '---',
  '',
  '<!-- .slide: data-background="#123456" -->',
  '## Energy $E = mc^2$',
  '',
  '<img src="missing.png" onerror="window.injected = true">',
  '',
  'note: Remember to smile',
  '',
].join('\n');

test('a note is presented full screen as slides, unsaved changes included', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-slides-'));
  const vault = join(directory, 'vault');
  await mkdir(join(directory, '.hackdesk'), { recursive: true });
  await mkdir(vault, { recursive: true });
  await writeFile(join(vault, 'Deck.md'), DECK);
  await writeFile(join(directory, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(directory, 'user-data')}`, `--hackdesk-home=${directory}`], cwd: repoRoot, env: environment() });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /^Deck/ }).first().click();
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Agenda details');

    // An unsaved last slide is presented too.
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n---\n\n## Unsaved slide');

    const opened = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Present' }).click();
    const presentation = await opened;
    await expect(presentation).toHaveURL(/#\/present$/);
    await expect(presentation.locator('.reveal.ready')).toBeVisible();
    await expect(presentation).toHaveTitle('Synthetic deck');
    await expect.poll(() => presentation.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--r-background-color').trim()))
      .toBe('#fdf6e3');

    const slides = presentation.locator('.reveal .slides > section');
    await expect(slides).toHaveCount(4);
    await expect(slides.nth(1).locator(':scope > section')).toHaveText([/Agenda/, /Agenda details/]);
    await expect(slides.nth(2)).toHaveAttribute('data-background', '#123456');
    await expect(slides.nth(2).locator('.katex')).toHaveCount(1);
    await expect(slides.nth(2).locator('aside.notes')).toBeHidden();
    await expect(presentation.locator('[onerror]')).toHaveCount(0);
    await expect(slides.nth(3)).toContainText('Unsaved slide');
    expect(await presentation.evaluate(() => 'injected' in window)).toBe(false);

    await expect(presentation.locator('section.present h1')).toHaveText('Welcome');
    // A `#` link to no slide must not replace the window's route.
    await presentation.getByRole('link', { name: 'Skip to the end' }).click();
    await expect(presentation).toHaveURL(/#\/present$/);
    await expect(presentation.locator('section.present h1')).toHaveText('Welcome');
    await presentation.keyboard.press('ArrowRight');
    await expect(presentation.locator('section.present h2').first()).toHaveText('Agenda');
    await presentation.keyboard.press('ArrowDown');
    await expect(presentation.locator('section.present h2').last()).toHaveText('Agenda details');
    await expect(presentation).toHaveURL(/#\/present$/);

    const closed = presentation.waitForEvent('close');
    // The window closes while the key press is still being delivered.
    await presentation.keyboard.press('Escape').catch(() => undefined);
    await closed;
    expect(app.windows()).toEqual([page]);
  } finally {
    // The note has unsaved changes, which would hold the app open.
    app.process().kill('SIGKILL');
  }
});
