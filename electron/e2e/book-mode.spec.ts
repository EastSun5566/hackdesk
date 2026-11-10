import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
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

async function home(prefix: string, settings: object) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(directory, '.hackdesk'), { recursive: true });
  await writeFile(join(directory, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, onboarding: { hackmdTokenSetupDeferred: true }, ...settings,
  }));
  return directory;
}

const editor = (page: Page) => page.locator('.cm-content');
const contents = (page: Page) => page.getByRole('navigation', { name: 'Book contents' });

function readFixture(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as unknown as { bookFixture: { lookups: string[]; external: string[] } }).bookFixture);
}

test('a HackMD book shows its contents and walks through its chapters', async () => {
  const directory = await home('hackdesk-book-', { hackmdApiToken: 'synthetic-fixture-token' });
  const app = await electron.launch({
    args: [join(repoRoot, 'electron/e2e/fixtures/hackmd-book-network.cjs'), `--hackdesk-home=${directory}`, `--user-data-dir=${join(directory, 'user-data')}`],
    cwd: repoRoot,
    env: environment(),
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /Handbook/ }).first().click();
    await expect(contents(page).locator('[data-book-chapter]')).toHaveText(['Table of contents', 'Setup', 'Tools', 'Guide', 'Docs']);
    // On the book's own note, editing it edits the contents, and the page says so.
    await expect(contents(page).getByRole('button', { name: 'Table of contents', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-book-contents-note]')).toBeVisible();
    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    // A chapter's breadcrumb is its book from the first frame, while it loads too.
    await page.evaluate(() => {
      const state = window as unknown as { folderCrumbForChapter?: string };
      new MutationObserver(() => {
        for (const nav of document.querySelectorAll('nav[aria-label="Note location"]')) {
          const title = nav.querySelector('[aria-current="page"]')?.textContent ?? '';
          if (['Setup', 'Tools', 'Guide'].includes(title) && !nav.querySelector('[aria-label$="edit table of contents"]')) {
            state.folderCrumbForChapter ??= title;
          }
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await contents(page).getByRole('button', { name: 'Setup' }).click();
    await expect(editor(page)).toContainText('Setup body text.');
    await expect(contents(page).getByRole('button', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-book-contents-note]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Next chapter: Tools' }).click();
    await expect(editor(page)).toContainText('Tools body text.');
    await page.getByRole('button', { name: 'Next chapter: Guide' }).click();
    await expect(editor(page)).toContainText('Guide body text.');
    expect(await page.evaluate(() => (window as unknown as { folderCrumbForChapter?: string }).folderCrumbForChapter)).toBeUndefined();
    // Chapters turn the book's tab instead of opening tabs of their own; it names the book.
    await expect(tabs).toHaveCount(tabCount);
    await expect(page.getByRole('tab', { selected: true }).locator('[data-tab-book]')).toHaveText('Handbook ›');
    // Back walks the chapters read in that tab.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(editor(page)).toContainText('Tools body text.');
    await page.getByRole('button', { name: 'Forward', exact: true }).click();
    await expect(editor(page)).toContainText('Guide body text.');
    // Three ways back to editing the contents: the row, the header button, and the chapter's breadcrumb.
    await contents(page).getByRole('button', { name: 'Table of contents', exact: true }).click();
    await expect(page.locator('[data-book-contents-note]')).toBeVisible();
    await expect(contents(page).getByRole('button', { name: 'Edit table of contents' })).toHaveCount(0);
    await contents(page).getByRole('button', { name: 'Guide' }).click();
    await expect(editor(page)).toContainText('Guide body text.');
    await expect(tabs).toHaveCount(tabCount);
    await contents(page).getByRole('button', { name: 'Edit table of contents' }).click();
    await expect(page.locator('[data-book-contents-note]')).toBeVisible();
    await contents(page).getByRole('button', { name: 'Tools' }).click();
    await expect(editor(page)).toContainText('Tools body text.');
    await page.getByRole('navigation', { name: 'Note location' }).getByRole('button', { name: 'Handbook, edit table of contents' }).click();
    await expect(page.locator('[data-book-contents-note]')).toBeVisible();
    await expect(tabs).toHaveCount(tabCount);
    await contents(page).getByRole('button', { name: 'Guide' }).click();
    await expect(editor(page)).toContainText('Guide body text.');
    // Setup and Tools were known locally; only the unlisted Guide was looked up.
    expect((await readFixture(app)).lookups).toEqual(['https://hackmd.io/@fixture/guide']);
    await expect(page.getByRole('button', { name: 'Previous chapter: Tools' })).toBeVisible();

    await contents(page).getByRole('button', { name: /Docs/ }).click();
    await expect.poll(async () => (await readFixture(app)).external).toEqual(['https://example.com/docs']);

    // The book's notes opened from the sidebar are regular notes in regular tabs; the book stays in its own tab.
    await page.getByRole('treeitem', { name: 'Setup', exact: true }).click();
    await expect(editor(page)).toContainText('Setup body text.');
    await expect(contents(page)).toHaveCount(0);
    await expect(page.getByRole('tab', { selected: true }).locator('[data-tab-book]')).toHaveCount(0);
    // A sidebar pick is a preview tab; double-clicking the note keeps it before the next pick.
    await expect(page.getByRole('tab', { selected: true })).toHaveAccessibleName(/^Setup, preview/);
    await page.getByRole('treeitem', { name: 'Setup', exact: true }).dblclick();
    await expect(page.getByRole('tab', { selected: true })).toHaveAccessibleName(/^Setup(?!, preview)/);
    await page.getByRole('treeitem', { name: 'Handbook', exact: true }).click();
    await expect(contents(page)).toHaveCount(0);
    await expect(page.locator('[data-book-contents-note]')).toHaveCount(0);
    await expect(tabs).toHaveCount(tabCount + 2);
    await page.getByRole('tab', { name: /^Guide/ }).click();
    await expect(contents(page)).toBeVisible();
    await expect(page.getByRole('tab', { selected: true }).locator('[data-tab-book]')).toHaveText('Handbook ›');

    await contents(page).getByRole('button', { name: 'Close book' }).click();
    await expect(contents(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('any Local Vault note opens as a book', async () => {
  const directory = await home('hackdesk-vault-book-', {});
  const vault = join(directory, 'vault');
  await mkdir(join(vault, 'chapters'), { recursive: true });
  await writeFile(join(vault, 'Index.md'), '# Index\n\n- [Alpha](./chapters/alpha.md)\n- [Beta](./chapters/beta.md)\n');
  await writeFile(join(vault, 'chapters', 'alpha.md'), '# Alpha\n\nAlpha body text.\n');
  await writeFile(join(vault, 'chapters', 'beta.md'), '# Beta\n\nBeta body text.\n');
  await writeFile(join(directory, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { vaults: [{ id: 'vault-e2e', path: vault }], activeVaultId: 'vault-e2e' }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(directory, 'user-data')}`, `--hackdesk-home=${directory}`], cwd: repoRoot, env: environment() });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /^Index/ }).first().click();
    await expect(editor(page)).toContainText('Alpha');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Open as Book/ }).click();

    // Reading with the sidebar hidden: chapters open in place and leave it hidden.
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    const expandSidebar = page.getByRole('button', { name: 'Expand sidebar' });
    await expect(expandSidebar).toBeVisible();
    // The contents stay through every chapter switch, even for a frame while the chapter loads.
    await page.evaluate(() => {
      const state = window as unknown as { bookContentsGone?: boolean };
      state.bookContentsGone = false;
      new MutationObserver(() => {
        if (!document.querySelector('nav[aria-label="Book contents"]')) state.bookContentsGone = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await contents(page).getByRole('button', { name: 'Alpha' }).click();
    await expect(editor(page)).toContainText('Alpha body text.');
    await page.getByRole('button', { name: 'Next chapter: Beta' }).click();
    await expect(editor(page)).toContainText('Beta body text.');
    await page.getByRole('button', { name: 'Previous chapter: Alpha' }).click();
    await expect(editor(page)).toContainText('Alpha body text.');
    await expect(expandSidebar).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { bookContentsGone?: boolean }).bookContentsGone)).toBe(false);

    // The contents hide and show again.
    await contents(page).getByRole('button', { name: 'Hide book contents' }).click();
    await expect(contents(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show book contents' }).click();
    await expect(contents(page).getByRole('button', { name: 'Beta' })).toBeVisible();
  } finally {
    await app.close();
  }
});
