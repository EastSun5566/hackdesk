import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { LOCAL_IMAGE_PNG } from './fixtures/local-image';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

async function pasteImage(page: Page) {
  await page.locator('.cm-content').evaluate((element, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'fixture.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...LOCAL_IMAGE_PNG]);
}

test('retries a transient read and cancels a real upload request without losing edits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-request-recovery-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, hackmdApiToken: 'synthetic-fixture-token',
    onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({
    args: [join(repoRoot, 'electron/e2e/fixtures/hackmd-network.cjs'), `--hackdesk-home=${home}`, `--user-data-dir=${join(home, 'user-data')}`],
    cwd: repoRoot, env,
  });
  const fixture = () => app.evaluate(() => (globalThis as unknown as {
    hackmdNetworkFixture: { reads: number; uploads: number; aborted: number; writes: number; note: { content: string } };
  }).hackmdNetworkFixture);
  try {
    const page = await app.firstWindow();
    await page.getByRole('treeitem', { name: /Alpha/ }).first().click();
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('Alpha body');
    expect((await fixture()).reads).toBe(2);

    await editor.fill('Unsaved edit\n\n');
    await page.keyboard.press('Control+End');
    await pasteImage(page);
    await expect.poll(async () => (await fixture()).uploads).toBe(1);
    await expect(editor).toContainText('Uploading image');
    // A second tab's upload must not hide the first tab's cancel action.
    await page.getByRole('treeitem', { name: /Beta/ }).first().click();
    await expect(editor).toContainText('Beta body');
    await editor.click();
    await page.keyboard.press('Control+End');
    await pasteImage(page);
    await expect.poll(async () => (await fixture()).uploads).toBe(2);
    await page.getByRole('tab', { name: /^Alpha(?:, .+)?$/ }).click();
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\nLater edit');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Cancel Image Upload', exact: true }).click();
    await expect.poll(async () => (await fixture()).aborted).toBe(1);
    await expect(editor).not.toContainText('Uploading image');
    await expect(editor).toContainText('Unsaved edit');
    await expect(editor).toContainText('Later edit');
    await expect.poll(() => page.evaluate(() => JSON.stringify(localStorage))).toContain('Later edit');
    expect((await fixture()).note.content).toBe('Alpha body');
    expect((await fixture()).uploads).toBe(2);

    await page.getByRole('tab', { name: /^Beta(?:, .+)?$/ }).click();
    await expect(editor).toContainText('Uploading image');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Cancel Image Upload', exact: true }).click();
    await expect.poll(async () => (await fixture()).aborted).toBe(2);
    await expect(editor).not.toContainText('Uploading image');
    await page.getByRole('tab', { name: /^Alpha(?:, .+)?$/ }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await fixture()).writes).toBe(1);
    expect((await fixture()).note.content).toContain('Later edit');
    expect((await fixture()).note.content).not.toContain('Uploading image');
  } finally {
    app.process().kill('SIGKILL');
  }
});
