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

// Playwright cannot write the OS clipboard here, so dispatch the paste event Chromium would.
async function pasteText(page: Page, text: string) {
  await editor(page).evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test('Local Vault notes link to each other, list their backlinks, and complete links', async () => {
  const directory = await home('hackdesk-vault-links-', {});
  const vault = join(directory, 'vault');
  await mkdir(vault);
  await writeFile(join(vault, 'A.md'), '# A\n\nSee [B](./B.md) for details.\n');
  await writeFile(join(vault, 'B.md'), '# B\n\nB body text.\n');
  await writeFile(join(vault, 'C.md'), '# C\n\n');
  await writeFile(join(directory, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(directory, 'user-data')}`, `--hackdesk-home=${directory}`], cwd: repoRoot, env: environment() });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('treeitem', { name: /^A/ }).first().click();
    await expect(editor(page)).toContainText('for details');
    await editor(page).getByRole('button', { name: 'Open link' }).click();
    await expect(editor(page)).toContainText('B body text.');

    await page.getByRole('button', { name: 'Expand note details' }).click();
    const linkedFrom = page.getByRole('button', { name: /^A\s*Local Vault/ });
    await expect(linkedFrom).toBeVisible();
    await linkedFrom.click();
    await expect(editor(page)).toContainText('for details');

    await page.getByRole('treeitem', { name: /^C/ }).first().click();
    await expect(editor(page)).toHaveText('# C');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n[B](');
    await page.locator('.cm-tooltip-autocomplete').getByText('B', { exact: true }).click();
    await expect(editor(page)).toContainText('[B](./B.md)');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByRole('status', { name: /Sync state: (Saved|Synced)/ })).toBeVisible();
  } finally {
    await app.close();
  }
});

function lookups(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as unknown as { linksFixture: { lookups: string[] } }).linksFixture.lookups);
}

function externalOpens(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as unknown as { linksFixture: { external: string[] } }).linksFixture.external);
}

test('HackMD embeds show as cards, links open in the app, and pasted URLs offer formats', async () => {
  const directory = await home('hackdesk-hackmd-links-', { hackmdApiToken: 'synthetic-fixture-token' });
  const app = await electron.launch({
    args: [join(repoRoot, 'electron/e2e/fixtures/hackmd-links-network.cjs'), `--hackdesk-home=${directory}`, `--user-data-dir=${join(directory, 'user-data')}`],
    cwd: repoRoot,
    env: environment(),
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const openAlpha = async () => {
      await page.getByRole('treeitem', { name: /Alpha/ }).first().click();
      await expect(editor(page)).toContainText('See');
    };
    await openAlpha();

    // The listed note is known locally, so the card has its title without calling HackMD.
    const card = page.locator('.cm-note-embed');
    await expect(card.locator('.cm-note-embed-title')).toHaveText('Beta');
    await card.getByRole('button', { name: 'Open Beta' }).click();
    await expect(editor(page)).toContainText('Beta body text.');
    expect(await lookups(app)).toEqual([]);
    await expect(page.getByRole('status', { name: /^Sync state:/ })).toHaveAccessibleName('Sync state: Saved');

    await page.getByRole('button', { name: 'Expand note details' }).click();
    await page.getByRole('button', { name: /^Linked from/ }).click();
    await expect(page.getByRole('button', { name: /^Alpha\s*My Workspace/ })).toBeVisible();

    await openAlpha();
    const links = editor(page).getByRole('button', { name: 'Open link' });
    await links.nth(0).click();
    await expect(editor(page)).toContainText('Gamma body text.');
    expect(await lookups(app)).toEqual(['https://hackmd.io/@fixture/gamma']);

    await openAlpha();
    await links.nth(1).click();
    await expect.poll(() => externalOpens(app)).toEqual(['https://example.com/page']);

    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await pasteText(page, 'https://hackmd.io/@fixture/beta');
    const menu = page.locator('.cm-tooltip-autocomplete');
    await expect(menu.locator('.cm-completionLabel')).toHaveText(['URL', 'Reference', 'Preview']);
    await menu.getByText('Reference').click();
    await expect(editor(page)).toContainText('[Beta](https://hackmd.io/@fixture/beta)');
  } finally {
    // The pasted link is left unsaved, which would hold the window open.
    app.process().kill('SIGKILL');
  }
});
