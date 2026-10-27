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
    await expect(contents(page).locator('[data-book-chapter]')).toHaveText(['Setup', 'Tools', 'Guide', 'Docs']);

    await contents(page).getByRole('button', { name: 'Setup' }).click();
    await expect(editor(page)).toContainText('Setup body text.');
    await expect(contents(page).getByRole('button', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Next chapter: Tools' }).click();
    await expect(editor(page)).toContainText('Tools body text.');
    await page.getByRole('button', { name: 'Next chapter: Guide' }).click();
    await expect(editor(page)).toContainText('Guide body text.');
    // Setup and Tools were known locally; only the unlisted Guide was looked up.
    expect((await readFixture(app)).lookups).toEqual(['https://hackmd.io/@fixture/guide']);
    await expect(page.getByRole('button', { name: 'Previous chapter: Tools' })).toBeVisible();

    await contents(page).getByRole('button', { name: /Docs/ }).click();
    await expect.poll(async () => (await readFixture(app)).external).toEqual(['https://example.com/docs']);

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
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(directory, 'user-data')}`, `--hackdesk-home=${directory}`], cwd: repoRoot, env: environment() });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /^Index/ }).first().click();
    await expect(editor(page)).toContainText('Alpha');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Open as Book/ }).click();

    await contents(page).getByRole('button', { name: 'Alpha' }).click();
    await expect(editor(page)).toContainText('Alpha body text.');
    await page.getByRole('button', { name: 'Next chapter: Beta' }).click();
    await expect(editor(page)).toContainText('Beta body text.');
    await page.getByRole('button', { name: 'Previous chapter: Alpha' }).click();
    await expect(editor(page)).toContainText('Alpha body text.');
  } finally {
    await app.close();
  }
});
