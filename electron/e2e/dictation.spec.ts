import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createFakeSpeechHelper } from '../src/main/dictation/fake-speech-helper';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Opens HackDesk on a one-note vault with dictation on, backed by a fake helper that hears "Hello world. Second line." */
async function launch() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-dictation-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Draft.md'), '# Draft\n\nNotes:\n');
  const fake = await createFakeSpeechHelper();
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { path: vault },
    onboarding: { hackmdTokenSetupDeferred: true },
    dictation: { enabled: true, locale: 'en-US' },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  // Development builds run this stand-in instead of the real helper.
  env.HACKDESK_SPEECH_HELPER = fake.executable;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const page = await app.firstWindow();
  await page.locator('.cm-line', { hasText: 'Notes:' }).click();
  await page.keyboard.press('End');
  return { app, page };
}

/** Presses the shortcut and, when no recording appears, says what happened instead. */
async function startDictation(page: Page) {
  await page.evaluate(() => {
    const keys: unknown[] = [];
    (window as unknown as { dictationKeys: unknown[] }).dictationKeys = keys;
    const log = (phase: string) => (event: KeyboardEvent) => keys.push([phase, event.key, event.ctrlKey, event.metaKey, event.shiftKey, event.defaultPrevented]);
    window.addEventListener('keydown', log('capture'), true);
    window.addEventListener('keydown', log('bubble'));
  });
  await page.keyboard.press(`${mod}+Shift+d`);
  const notifications = page.getByLabel('Notifications', { exact: true });
  const inserted = page.locator('.cm-line', { hasText: 'Second line.' });
  try {
    await expect(page.locator('.cm-dictation-pill').or(notifications.getByRole('status')).or(inserted).first()).toBeVisible();
  } catch (error) {
    // Nothing happened at all: report how far the key press got.
    const details = await page.evaluate(async () => ({
      keys: (window as unknown as { dictationKeys: unknown[] }).dictationKeys,
      focused: document.activeElement?.className,
      settings: (await window.hackdeskAPI?.settings.get())?.dictation,
      status: await window.hackdeskAPI?.dictation?.status().catch((statusError: unknown) => String(statusError)),
    }));
    throw new Error(`No recording started: ${JSON.stringify(details)}`, { cause: error });
  }
  expect(await notifications.innerText(), 'an error toast').toBe('');
  await expect(inserted, 'stopped at once, as if pressed twice').toHaveCount(0);
}

test('dictation shows what it hears, then inserts it in one undoable edit', async () => {
  const { app, page } = await launch();
  try {
    await startDictation(page);
    // Heard words show at the cursor; the note itself is unchanged until the recording ends.
    await expect(page.locator('.cm-dictation-text')).toHaveText(' Hello world. Second');
    await expect(page.locator('.cm-dictation-pill')).toContainText('Esc to cancel');
    await expect(page.locator('.cm-line', { hasText: 'Notes:' })).toHaveText(/^Notes: Hello world\. Second/);

    await page.keyboard.press(`${mod}+Shift+d`);
    await expect(page.locator('.cm-dictation-pill')).toHaveCount(0);
    await expect(page.locator('.cm-line', { hasText: 'Notes:' })).toHaveText('Notes: Hello world. Second line.');

    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator('.cm-line', { hasText: 'Notes:' })).toHaveText('Notes:');
  } finally {
    await app.close();
  }
});

test('Escape cancels dictation without touching the note', async () => {
  const { app, page } = await launch();
  try {
    await startDictation(page);
    await expect(page.locator('.cm-dictation-text')).toHaveText(' Hello world. Second');
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-dictation-pill')).toHaveCount(0);
    await expect(page.locator('.cm-line', { hasText: 'Notes:' })).toHaveText('Notes:');
  } finally {
    await app.close();
  }
});
